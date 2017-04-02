import { Type } from "./types";
import { traverse, deepCopy, deepEqual, setEquivalent } from "./util";
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
        make(type: Type.Type) {
            const vnew = new (valueConstructorForType(type))(type, this);
            this.add(vnew);
            return vnew;
        }


        add(value: Value) {
            this.values.set(value.uuid, value);
            this.updateDependencies(value, new Set(), new Set(value.computeDependencies()));
            return value;
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
            const removedDependecies = [...oldDeps].filter(x => !newDeps.has(x));
            const addedDependecies = [...newDeps].filter(x => !oldDeps.has(x));

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
                    new Error("while traversing dependencies, a Value was found that was not in the environment");
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
    }

    type ExtendedMetaType = Type.MetaType | typeof ArrayType | typeof SetType | typeof MapType;
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
            if (typeof (v) !== this.type.name) {
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
            }
        }
    }

    @TypeValue(Type.Literal)
    export class Literal extends Value {
        readonly serialRepresentation: Type.PrimitiveTS;
        readonly value: Type.PrimitiveTS;

        constructor(type: Type.Literal, environment: Environment) {
            super(type, environment);
            this.value = this.serialRepresentation = type.value;
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
    }

    export const CustomObjectType: Type.Type = {
        name: "custom-object-type",
        equals: (that) => that === CustomObjectType,
    };

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

    export class ArrayType implements Type.Type {
        name = "Array";
        constructor(readonly typeParameter: Type.Type) {

        }

        equals(that: Type.Type): boolean {
            return that instanceof ArrayType && this.typeParameter === that.typeParameter;
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

        push(v: Value) {
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

    }

    export class MapType implements Type.Type {
        name = "Map";
        constructor(readonly keyType: Type.Type,
            readonly valueType: Type.Type) {

        }

        equals(that: Type.Type): boolean {
            return that instanceof MapType && this.keyType === that.keyType && this.valueType === that.valueType;
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
            return {
                kind: "es6-map-object",
                entries: [...this.underlying.entries()]
            };
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
    }

    export class SetType implements Type.Type {
        name = "Set";
        typeParameter: Type.Type;

        equals(that: Type.Type): boolean {
            return that instanceof SetType && this.typeParameter === that.typeParameter;
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
            return {
                kind: "es6-set-object",
                values: [...this.underlying.values()]
            };
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
    }

    @TypeValue(Type.CustomObject)
    export class CustomObject extends BaseObject {
        readonly simpleRepresentation: any = {};

        constructor(readonly type: Type.CustomObject, environment: Environment) {
            super(type, environment);
        }

        call(name: string, ...args: Value[]): Value | void {
            const method = this.type.methods.get(name);
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
    }

    class CustomObjectForIntersection extends CustomObject {
        get serialRepresentation() {
            return {};
        };
        constructor(type: Type.CustomObject, environment: Environment, readonly simpleRepresentation: any) {
            super(type, environment);
        }
    }

    @TypeValue(Type.Intersection)
    export class Intersection extends BaseObject {
        simpleRepresentation: any = {};

        private values = new Map<Type.CustomObject, CustomObjectForIntersection>();

        constructor(readonly type: Type.Intersection, environment: Environment) {
            super(type, environment);

            for (const innerType of type.types) {
                const value = new CustomObjectForIntersection(innerType, environment, this.simpleRepresentation);
                this.values.set(innerType, value);
            }
        }

        get(key: string) {
            CustomObject.prototype.get.call(this, key);
        }

        set(key: string, value: Value) {
            for (const type of this.type.types) {
                if (type.members.has(key)) {
                    return this.values.get(type)!.set(key, value);
                }
            }
        }

        call(method: string, ...args: Value[]) {
            for (const type of this.type.types) {
                if (type.methods.has(method)) {
                    return this.values.get(type)!.call(method, ...args);
                }
            }
            throw new Error(`cannot call "${name}". Method not found`);
        }
    }
}