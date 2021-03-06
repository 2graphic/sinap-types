import { Type } from "./types";
import { traverse, deepCopy, deepEqual, setEquivalent, ifilter, imap, izip, ireduce } from "./util";
import { v4 as uuid } from "uuid";

export namespace Value {

    export type ValueReference = { kind: "value-reference", uuid: string };

    class Listener {
        constructor(
            readonly callback: (root: Value, value: Value, other: any) => void,
            readonly filter: (value: Value) => boolean,
            readonly root: Value,
        ) { }
    }

    function traverseDeps(root: Value, visit: (v: Value) => boolean) {
        if (!visit(root)) {
            return;
        }
        for (const dep of root.dependencyChildren) {
            traverseDeps(dep, visit);
        }
    }

    /**
     * Holds a bunch of values and ties them all together. Allows you to retrieve a
     * value by UUID.
     */
    export class Environment {
        values = new Map<string, Value>();

        /**
         * Make an object of the given `type`
         * @param type type of the object to create
         */
        make(type: Type.CustomObject, uuid?: string): Value.CustomObject;
        make(type: Type.Intersection, uuid?: string): Value.CustomObject;
        make(type: Type.Literal, uuid?: string): Value.Literal;
        make(type: Type.Primitive, uuid?: string): Value.Primitive;
        make(type: Value.ArrayType, uuid?: string): Value.ArrayObject;
        make(type: Value.MapType, uuid?: string): Value.MapObject;
        make(type: Value.SetType, uuid?: string): Value.SetObject;
        make(type: Value.TupleType, uuid?: string): Value.TupleObject;
        make(type: Type.Union, uuid?: string): Value.Union;
        make(type: Type.Type, uuid?: string): Value.Value;
        make(type: Type.Type, uuid?: string) {
            const vnew = new (valueConstructorForType(type))(type, this);
            if (uuid) {
                (vnew as any).uuid = uuid;
            }
            this.add(vnew);
            return vnew;
        }


        add(value: Value) {
            const waitingFuncs = this.waitingForUUIDs.get(value.uuid);
            if (waitingFuncs) {
                this.waitingForUUIDs.delete(value.uuid);
                for (const func of waitingFuncs) {
                    func(value);
                }
            }
            this.values.set(value.uuid, value);
            this.updateDependencies(value, new Set(), new Set(value.computeDependencies()));
            return value;
        }

        private waitingForUUIDs = new Map<string, Set<(value: Value) => void>>();

        whenHas(uuid: string, func: (v: Value) => void) {
            const value = this.values.get(uuid);
            if (value) {
                func(value);
            } else {
                let pool = this.waitingForUUIDs.get(uuid);
                if (!pool) {
                    pool = new Set();
                    this.waitingForUUIDs.set(uuid, pool);
                }
                pool.add(func);
            }
        }

        toReference(value: Value): ValueReference {
            return { kind: "value-reference", uuid: value.uuid };
        }

        fromReference(ref: ValueReference) {
            if (ref.kind !== "value-reference") {
                throw new Error("not a value reference");
            }
            const value = this.values.get(ref.uuid);
            if (!value) {
                throw new Error("value not in environment");
            }
            return value;
        }

        private updateDependencies(value: Value, oldDeps: Set<Value>, newDeps: Set<Value>) {
            const removedDependecies = ifilter(x => !newDeps.has(x), oldDeps);
            const addedDependecies = ifilter(x => !oldDeps.has(x), newDeps);

            for (const dep of removedDependecies) {
                dep.dependencyParents.delete(value);
            }

            for (const dep of addedDependecies) {
                dep.dependencyParents.add(value);
            }

            value.dependencyChildren = newDeps;
            this.rebuildDependencyMaps();
        }

        private addDepencies(listener: Listener) {
            traverseDeps(listener.root, (v) => {
                if (!listener.filter(v)) {
                    return false;
                }
                if (!this.values.has(v.uuid)) {
                    throw new Error("while traversing dependencies, a Value was found that was not in the environment");
                }
                let pool = this.listenersForValue.get(v);
                if (pool) {
                    if (pool.has(listener)) {
                        // break cycles
                        return false;
                    }
                } else {
                    pool = new Set();
                    this.listenersForValue.set(v, pool);
                }
                pool.add(listener);
                return true;
            });
        }

        private rebuildDependencyMaps() {
            this.listenersForValue = new Map();

            for (const listener of this.listeners) {
                this.addDepencies(listener);
            }
        }

        valueChanged(value: Value, change: any) {
            const newDeps = new Set(value.computeDependencies());
            if (!setEquivalent(newDeps, value.dependencyChildren)) {
                this.updateDependencies(value, value.dependencyChildren, newDeps);
            }

            const listeners = this.listenersForValue.get(value);
            if (listeners) {
                for (const listener of listeners) {
                    listener.callback(listener.root, value, change);
                }
            }
        }

        private listenersForValue = new Map<Value, Set<Listener>>();
        private listeners: Set<Listener> = new Set();

        listen(callback: (root: Value, value: Value, other: any) => void, filter: (value: Value) => boolean, root: Value) {
            if (!this.values.has(root.uuid)) {
                throw new Error("trying to listen to object not in the environment");
            }
            const listener = new Listener(callback, filter, root);
            this.listeners.add(listener);
            this.addDepencies(listener);
        }

        /**
         * Remove references to all values not reachable from roots
         * @param roots an iterable of values to start flagging from
         */
        garbageCollect(roots: Iterable<Value>) {
            // TODO: reason about how to avoid this
            const seen = new Set<Value>();
            function traverse(parent: Value) {
                if (seen.has(parent)) {
                    return;
                }
                seen.add(parent);
                for (const child of parent.dependencyChildren) {
                    traverse(child);
                }
            }
            for (const root of roots) {
                traverse(root);
            }
            for (const value of this.values.values()) {
                if (!seen.has(value)) {
                    this.delete(value);
                }
            }
        }

        delete(value: Value) {
            for (const listener of this.listeners) {
                if (listener.root.uuid === value.uuid) {
                    this.listeners.delete(listener);
                }
            }
            this.values.delete(value.uuid);
        }

        fromSerial(t: Type.Type, jso: any, uuid: string) {
            const v = this.make(t, uuid);
            v.loadSerial(jso);
            return v;
        }
    }

    type ExtendedMetaType = Type.TypeType | typeof ArrayType | typeof SetType | typeof MapType | typeof TupleType;
    const classes: [ExtendedMetaType, { new (t: Type.Type, environment: Environment): Value }][] = [];
    function valueConstructorForType(type: Type.Type) {
        const potentialConstructors = classes.filter(([t, _]) => type instanceof t).map(([_, v]) => v);
        if (potentialConstructors.length !== 1) {
            throw new Error("can't find given type");
        }
        return potentialConstructors[0];
    }

    function TypeValue(s: ExtendedMetaType) {
        return (constructor: { new (t: Type.Type, environment: Environment): Value }) => {
            classes.push([s, constructor]);
        };
    }

    /**
     * A generic typed value
     */
    export abstract class Value {
        dependencyParents = new Set<Value>();
        dependencyChildren = new Set<Value>();

        /**
         * A unique way to reference this object
         */
        readonly uuid = uuid();

        /**
         * This is a simple javascript object (something that could be `JSON.stringify`d,
         * so no complicated objects or cycles) that represents the Value. The value
         * can be reconstructed from this representation and vice versa.
         */
        abstract readonly serialRepresentation: any;

        /**
         * Unused by us, available for: whatever you want to tag with this value
         */
        public context: any;

        /**
         * @param type the type that goes with the `Value`
         * @param environment the `Environment` this will be part of
         */
        constructor(
            readonly type: Type.Type,
            readonly environment: Environment) {

        }

        /**
         * Subclasses can override this if the can determine equality more easily.
         *
         * Generic version checks if UUID's match. Failing that it checks if the serial
         * representations are the same,  and recurses from there
         * @param that Value to compare with
         */
        deepEqual(that: Value): boolean {
            if (this.uuid === that.uuid) {
                return true;
            }
            return deepEqual(this.serialRepresentation, that.serialRepresentation, (a, b) => {

                if (a.kind === "value-reference") {
                    if (b.kind !== "value-reference") {
                        return false;
                    }
                    const av = this.environment.fromReference(a);
                    const bv = this.environment.fromReference(b);
                    return av.deepEqual(bv);
                }
                return "recurse";
            });
        }

        computeDependencies() {
            const deps: Value[] = [];
            traverse(this.serialRepresentation, (a) => {
                if (typeof (a) === "object" && a.kind === "value-reference") {
                    deps.push(this.environment.fromReference(a));
                    return false;
                }
                return true;
            });
            return deps;
        }

        abstract loadSerial(jso: any): void;

        /// TODO: Notify replace??

        // TODO: until old values are cleared from environment, we have a serious memory leak
        // a simple GC is one solution, but that sounds slow.
        // we can keep track of when things are no longer referenced, and that sounds much better.
        // might not support cycles?
    }

    @TypeValue(Type.Primitive)
    export class Primitive extends Value {
        get serialRepresentation() {
            return this.value;
        }
        private _value: Type.PrimitiveTS;
        get value() {
            return this._value;
        }
        set value(v) {
            if (typeof (v) !== this.type.name) NoError: {
                if (typeof (v) === "string") {
                    if (this.type.name === "color") {
                        break NoError;
                    }
                    if (this.type.name === "file") {
                        break NoError;
                    }
                }
                throw new Error(`cannot store a ${typeof (v)} in a ${this.type.name}`);
            }
            const oldValue = this._value;
            this._value = v;
            this.environment.valueChanged(this, { from: oldValue, to: v });
        }

        constructor(type: Type.Primitive, environment: Environment, value?: Type.PrimitiveTS) {
            super(type, environment);
            if (value) {
                this._value = value;
            } else if (this.type.name === "number") {
                this._value = 0;
            } else if (this.type.name === "string") {
                this._value = "";
            } else if (this.type.name === "boolean") {
                this._value = false;
            } else if (this.type.name === "color") {
                this._value = "#ffff00";
            } else if (this.type.name === "file") {
                this._value = "NO FILE";
            }
        }

        loadSerial(j: any) {
            this.value = j;
        }
    }

    export function makePrimitive(env: Environment, value: Type.PrimitiveTS) {
        return new Primitive(new Type.Primitive(typeof (value) as Type.PrimitiveName), env, value);
    }

    @TypeValue(Type.Literal)
    export class Literal extends Value {
        readonly serialRepresentation: Type.PrimitiveTS;
        readonly value: Type.PrimitiveTS;

        constructor(type: Type.Literal, environment: Environment) {
            super(type, environment);
            this.value = this.serialRepresentation = type.value;
        }
        loadSerial() {
        }
    }

    function assignRecords(a: Value, b: Value): boolean {
        if ((a instanceof Record) && (b instanceof Record) && Type.isSubtype(a.type, b.type)) {
            b.assign(a);
            return true;
        }
        return false;
    }

    @TypeValue(Type.Record)
    export class Record extends Value {
        private _value: { [a: string]: Value } = {};
        readonly value = new Proxy(this._value, {
            set: (t, k: string, v) => {
                const type = this.type.members.get(k);
                if (!type) {
                    throw new Error(`key: ${k} doesn't exist`);
                }
                if (!(v instanceof Value)) {
                    throw new Error(`must set values to .value`);
                }
                if (!Type.isSubtype(v.type, type)) {
                    throw new Error(`${v.type.name} is not assignable to ${type.name}`);
                }
                if (!assignRecords(v, t[k])) {
                    const oldValue = t[k];
                    t[k] = v;
                    this.environment.add(v);
                    this.environment.valueChanged(this, { key: k, from: oldValue, to: v });
                    this.environment.add(v);
                }
                return true;
            }
        });

        assign(rec: Record) {
            for (const key of rec.type.members.keys()) {
                const v1 = this.value[key];
                const v2 = rec.value[key];
                if ((v1 instanceof Primitive) && ((v2 instanceof Primitive) || (v2 instanceof Literal))) {
                    v1.value = v2.value;
                } else {
                    this.value[key] = rec.value[key];
                }
            }
        }

        get serialRepresentation() {
            const serialRepresentation: { [a: string]: { kind: "value-reference", uuid: string } } = {};
            for (const key in this.value) {
                serialRepresentation[key] = this.environment.toReference(this.value[key]);
            }
            return serialRepresentation;
        }

        constructor(readonly type: Type.Record, environment: Environment) {
            super(type, environment);
            for (const [key, valueType] of type.members.entries()) {
                const value = this.environment.make(valueType);
                this.value[key] = value;
            }
        }

        loadSerial(jso: any) {
            for (const key in jso) {
                this.environment.whenHas(jso[key].uuid, (value: Value) => {
                    this.value[key] = value;
                });
            }
        }
    }

    export abstract class BaseObject extends Value {
        abstract simpleRepresentation: any;

        get serialRepresentation() {
            return deepCopy(this.simpleRepresentation, (k) => {
                if (k instanceof Value) {
                    return { replace: true, value: this.environment.toReference(k) };
                }
                return { replace: false };
            });
        }

        constructor(type: Type.Type, environment: Environment) {
            super(type, environment);
        }
    }

    const ArrayMetaType: Type.MetaType = {
        name: "Array",
        intersect: (types: Iterable<ArrayType>, mappings) => {
            const parameter = Type.intersectTypes(imap(t => t.typeParameter, types), mappings);
            return new ArrayType(parameter);
        }
    };

    export class ArrayType implements Type.Type {
        metaType = ArrayMetaType;
        name = "Array";
        constructor(readonly typeParameter: Type.Type) {

        }

        equals(that: Type.Type): boolean {
            return that instanceof ArrayType && this.typeParameter.equals(that.typeParameter);
        }

        isSubtype(that: Type.Type): boolean {
            return (that instanceof ArrayType
                && Type.isSubtype(this.typeParameter, that.typeParameter));
        }
    }

    @TypeValue(ArrayType)
    export class ArrayObject extends BaseObject {
        private underlying: Value[] = [];

        get simpleRepresentation() {
            return this.underlying;
        }

        constructor(readonly type: ArrayType, environment: Environment) {
            super(type, environment);
        }

        get length(): number {
            return this.underlying.length;
        }

        push(v: Value) {
            this.environment.add(v);
            const index = this.underlying.push(v);
            this.environment.valueChanged(this, { push: v });
            return index;
        }

        pop() {
            const value = this.underlying.pop();
            this.environment.valueChanged(this, { pop: value });
            return value;
        }

        index(n: number, newValue?: Value) {
            if (newValue) {
                if (!assignRecords(newValue, this.underlying[n])) {
                    const oldValue = this.underlying[n];
                    this.underlying[n] = newValue;
                    this.environment.add(newValue);
                    this.environment.valueChanged(this, { index: n, from: oldValue, to: newValue });
                    return newValue;
                } else {
                    // note this shouldn't assign, the below is correct
                    return this.underlying[n];
                }
            } else {
                return this.underlying[n];
            }
        }

        [Symbol.iterator]() {
            return this.underlying[Symbol.iterator]();
        }

        loadSerial(jso: any) {
            for (const ref of jso) {
                this.environment.whenHas(ref.uuid, (value: Value) => {
                    this.push(value);
                });
            }
        }
    }

    const TupleMetaType: Type.MetaType = {
        name: "Tuple",
        intersect: (types: Iterable<TupleType>, mappings) => {
            // iterable of lists of parameter types
            const parameterSets = imap(t => t.typeParameters, types);
            // transpose, so now all the 1st index types are grouped together
            const setsForParameters = izip(...parameterSets);
            // intersect all the groups of parameters
            const parameters = imap(ts => Type.intersectTypes(ts, mappings), setsForParameters);
            return new TupleType([...parameters]);
        }
    };

    export class TupleType implements Type.Type {
        metaType = TupleMetaType;
        name = "Tuple";
        constructor(readonly typeParameters: Type.Type[]) {

        }

        equals(that: Type.Type): boolean {
            if (!(that instanceof TupleType)) {
                return false;
            }
            if (this.typeParameters.length !== that.typeParameters.length) {
                return false;
            }
            return ireduce((prev, [a, b]) => prev && a.equals(b), true, izip(this.typeParameters, that.typeParameters));
        }

        isSubtype(that: Type.Type): boolean {
            if (!(that instanceof TupleType)) {
                return false;
            }
            if (this.typeParameters.length !== that.typeParameters.length) {
                return false;
            }

            return ireduce((prev, [a, b]) => prev && Type.isSubtype(a, b), true, izip(this.typeParameters, that.typeParameters));
        }
    }

    @TypeValue(TupleType)
    export class TupleObject extends BaseObject {
        private underlying: Value[] = [];

        get simpleRepresentation() {
            return this.underlying;
        }

        constructor(readonly type: TupleType, environment: Environment) {
            super(type, environment);

            for (const t of this.type.typeParameters) {
                this.underlying.push(this.environment.make(t));
            }
        }

        index(n: number, newValue?: Value) {
            if (newValue) {
                if (n >= this.type.typeParameters.length || n < 0) {
                    throw new Error(`index ${n} out of range`);
                }
                if (!Type.isSubtype(newValue.type, this.type.typeParameters[n])) {
                    throw new Error(`${newValue.type} is not assignable to ${this.type.typeParameters[n]} at index: ${n}`);
                }
                if (!assignRecords(newValue, this.underlying[n])) {
                    const oldValue = this.underlying[n];
                    this.underlying[n] = newValue;
                    this.environment.add(newValue);
                    this.environment.valueChanged(this, { index: n, from: oldValue, to: newValue });
                    return newValue;
                } else {
                    // note this shouldn't assign, the below is correct
                    return this.underlying[n];
                }
            } else {
                return this.underlying[n];
            }
        }

        [Symbol.iterator]() {
            return this.underlying[Symbol.iterator]();
        }

        loadSerial(jso: any[]) {
            jso.forEach((ref, idx) => {
                this.environment.whenHas(ref.uuid, (value: Value) => {
                    this.index(idx, value);
                });
            });
        }
    }

    const MapMetaType: Type.MetaType = {
        name: "Map",
        intersect: (types: Iterable<MapType>, mappings) => {
            const key = Type.intersectTypes(imap(t => t.keyType, types), mappings);
            const value = Type.intersectTypes(imap(t => t.keyType, types), mappings);
            return new MapType(key, value);
        }
    };

    export class MapType implements Type.Type {
        metaType = MapMetaType;
        name = "Map";
        constructor(readonly keyType: Type.Type,
            readonly valueType: Type.Type) {

        }

        equals(that: Type.Type): boolean {
            return that instanceof MapType && this.keyType.equals(that.keyType) && this.valueType.equals(that.valueType);
        }

        isSubtype(that: Type.Type): boolean {
            return (that instanceof MapType
                && Type.isSubtype(this.keyType, that.keyType)
                && Type.isSubtype(this.valueType, that.valueType));
        }
    }


    @TypeValue(MapType)
    export class MapObject extends BaseObject {
        private underlying: Map<Value, Value> = new Map();

        get simpleRepresentation() {
            return [...this.underlying.entries()];
        }

        constructor(readonly type: MapType, environment: Environment) {
            super(type, environment);
        }

        has(k: Value) {
            if (!Type.isSubtype(k.type, this.type.keyType)) {
                throw new Error("invalid key");
            }
            return this.underlying.has(k);
        }

        get(k: Value) {
            if (!Type.isSubtype(k.type, this.type.keyType)) {
                throw new Error("invalid key");
            }
            return this.underlying.get(k);
        }

        set(k: Value, v: Value) {
            if (!Type.isSubtype(k.type, this.type.keyType)) {
                throw new Error("invalid key");
            }
            if (!Type.isSubtype(v.type, this.type.valueType)) {
                throw new Error("invalid value");
            }
            const existingValue = this.underlying.get(k);
            if (existingValue && (v.type instanceof Record)) {
                if (!assignRecords(v, existingValue)) {
                    throw Error("WTF 21627132");
                }
            } else {
                this.environment.add(k);
                this.environment.add(v);
                this.underlying.set(k, v);
                this.environment.valueChanged(this, { key: k, from: existingValue, to: v });
            }
        }

        [Symbol.iterator]() {
            return this.underlying[Symbol.iterator]();
        }
        loadSerial(jso: any) {
            for (const [keyRef, valueRef] of jso) {
                this.environment.whenHas(keyRef.uuid, (keyValue: Value) => {
                    this.environment.whenHas(valueRef.uuid, (valueValue: Value) => {
                        this.set(keyValue, valueValue);
                    });
                });
            }
        }
    }

    const SetMetaType: Type.MetaType = {
        name: "Set",
        intersect: (types: Iterable<SetType>, mappings) => {
            const parameter = Type.intersectTypes(imap(t => t.typeParameter, types), mappings);
            return new SetType(parameter);
        }
    };

    export class SetType implements Type.Type {
        metaType = SetMetaType;
        name = "Set";
        constructor(readonly typeParameter: Type.Type) { }

        equals(that: Type.Type): boolean {
            return that instanceof SetType && this.typeParameter.equals(that.typeParameter);
        }

        isSubtype(that: Type.Type): boolean {
            return (that instanceof SetType
                && Type.isSubtype(this.typeParameter, that.typeParameter));
        }
    }

    @TypeValue(SetType)
    export class SetObject extends BaseObject {
        private underlying: Set<Value> = new Set();

        get simpleRepresentation() {
            return [...this.underlying.values()];
        }

        constructor(readonly type: SetType, readonly environment: Environment) {
            super(type, environment);
        }

        has(k: Value) {
            if (!Type.isSubtype(k.type, this.type.typeParameter)) {
                throw new Error(`invalid key ${k}`);
            }
            return this.underlying.has(k);
        }

        add(v: Value) {
            if (!Type.isSubtype(v.type, this.type.typeParameter)) {
                throw new Error("invalid value");
            }
            this.environment.add(v);
            this.underlying.add(v);
            this.environment.valueChanged(this, { add: v });
        }

        delete(v: Value) {
            if (!Type.isSubtype(v.type, this.type.typeParameter)) {
                throw new Error("invalid value");
            }
            // TODO: notify environment for garbage collection
            const result = this.underlying.delete(v);
            this.environment.valueChanged(this, { delete: v });
            return result;
        }

        [Symbol.iterator]() {
            return this.underlying[Symbol.iterator]();
        }
        loadSerial(jso: any) {
            for (const ref of jso) {
                this.environment.whenHas(ref.uuid, (value: Value) => {
                    this.add(value);
                });
            }
        }
    }

    @TypeValue(Type.CustomObject)
    @TypeValue(Type.Intersection)
    export class CustomObject extends BaseObject {
        readonly simpleRepresentation: any = {};

        constructor(readonly type: Type.CustomObject | Type.Intersection, environment: Environment) {
            super(type, environment);
        }
        initialize() {
            for (const [key, member] of this.type.members) {
                this.set(key, this.environment.make(member));
            }
            this.environment.valueChanged(this, "initialized");
        }

        call(name: string, ...args: Value[]): Value | void {
            let maybeMethod: Type.MethodObject | undefined;
            if (this.type instanceof Type.Intersection) {
                for (const t of this.type.types) {
                    maybeMethod = t.methods.get(name);
                    if (maybeMethod) {
                        break;
                    }
                }
            } else {
                maybeMethod = this.type.methods.get(name);
            }
            const method = maybeMethod;
            if (!method) {
                throw new Error(`cannot call "${name}". Method not found`);
            }

            args.map((arg, idx) => {
                if (!Type.isSubtype(arg.type, method.argTypes[idx])) {
                    throw new Error("incompatible arguments");
                }
            });

            // TODO: track changes originating here
            const returnValue = method.implementation.call(this, ...args) as void | Value;
            if (method.returnType) {
                if (!returnValue || !Type.isSubtype(returnValue.type, method.returnType)) {
                    throw new Error("returned incompatible value");
                }
                this.environment.add(returnValue);
                return returnValue;
            }
        }

        get(name: string): Value {
            return this.simpleRepresentation[name];
        }

        set(name: string, value: Value) {
            const type = this.type.members.get(name);
            if (!type) {
                throw new Error(`field ${name} does not exist`);
            }
            if (!Type.isSubtype(value.type, type)) {
                throw new Error(`cannot set field ${name}, type of value passed is incorrect`);
            }
            const oldValue = this.simpleRepresentation[name];
            if (!assignRecords(value, this.simpleRepresentation[name])) {
                this.simpleRepresentation[name] = value;
                this.environment.add(value);
                this.environment.valueChanged(this, { key: name, from: oldValue, to: value });
            }
        }

        loadSerial(jso: any) {
            for (const key in jso) {
                this.environment.whenHas(jso[key].uuid, (value: Value) => {
                    this.set(key, value);
                });
            }
        }
    }

    @TypeValue(Type.Union)
    export class Union extends Value {
        private _value: Value;
        get value() {
            return this._value;
        }
        set value(v: Value) {
            const old = this._value;
            this.environment.add(v);
            this._value = v;
            this.environment.valueChanged(this, { from: old, to: v });
        }

        get serialRepresentation() {
            return this.environment.toReference(this.value);
        }

        constructor(readonly type: Type.Union, environment: Environment) {
            super(type, environment);

            this.value = this.environment.make(this.type.types.values().next().value);
        }

        loadSerial(jso: any) {
            this.environment.whenHas(jso.uuid, (value: Value) => {
                this.value = value;
            });
        }
    }
}