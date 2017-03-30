/// <reference path="typings/index.d.ts" />

import { Type } from "./types";
import { traverse, deepCopy, deepEqual } from "./util";
import { v4 as uuid } from "uuid";

export namespace Value {

    export type ValueReference = { kind: "value-reference", uuid: string };

    export class Environment {
        values = new Map<string, Value>();

        make(type: Type.Type) {
            const vnew = new (valueConstructorForType(type))(type, this);
            this.add(vnew);
            return vnew;
        }

        add(value: Value) {
            this.values.set(value.uuid, value);
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
    }


    const classes: [Type.MetaType, { new (t: Type.Type, environment: Environment): Value }][] = [];
    function valueConstructorForType(type: Type.Type) {
        const potentialConstructors = classes.filter(([t, _]) => type instanceof t).map(([_, v]) => v);
        if (potentialConstructors.length !== 1) {
            throw new Error("can't find given type");
        }
        return potentialConstructors[0];
    }

    function TypeValue(s: Type.MetaType) {
        return (constructor: { new (t: Type.Type, environment: Environment): Value }) => {
            classes.push([s, constructor]);
        };
    }

    export abstract class Value {
        readonly uuid = uuid();
        abstract readonly serialRepresentation: any;

        constructor(
            readonly type: Type.Type,
            readonly environment: Environment) {

        }

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

        /// TODO: Notify replace??

        // TODO: until old values are cleared from environment, we have a serious memory leak
        // a simple GC is one solution, but that sounds slow.
        // we can keep track of when things are no longer referenced, and that sounds much better.
        // might not support cycles?
    }
    export function dependecies(v: Value) {
        const deps: string[] = [];
        traverse(v.serialRepresentation, (a) => {
            if (typeof (a) === "object" && a.kind === "value-reference") {
                deps.push(a.uuid);
                return false;
            }
            return true;
        });
        return deps;
    }

    @TypeValue(Type.Primitive)
    export class Primitive extends Value {
        get serialRepresentation() {
            return this.value;
        }
        value: Type.PrimitiveTS;

        constructor(type: Type.Primitive, environment: Environment, value?: Type.PrimitiveTS) {
            super(type, environment);
            if (value) {
                this.value = value;
            } else if (this.type.name === "number") {
                this.value = 0;
            } else if (this.type.name === "string") {
                this.value = "";
            } else if (this.type.name === "boolean") {
                this.value = false;
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
                    throw new Error(`${v.type.name} is not assignable to ${type}`);
                }
                t[k] = v;
                this.environment.add(v);
                return true;
            }
        });

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

    // TODO: uncomment
    // @TypeValue(Type.Object)
    export class CustomObject<M extends Manager> extends Value {
        get serialRepresentation() {
            return deepCopy(this.manager.simpleRepresentation, (k) => {
                if (k instanceof Value) {
                    return { replace: true, value: this.environment.toReference(k) };
                }
                return { replace: false };
            });
        }

        constructor(readonly manager: M, environment: Environment) {
            super(CustomObjectType, environment);
        }
    }

    export function makeObject(type: Type.CustomObject, environment: Environment) {
        const manager = new MethodManager(type, environment);
        return new CustomObject(manager, environment);
    }

    export interface Manager {
        simpleRepresentation: any;
    }

    export class ArrayManager implements Manager {
        private underlying: Value[] = [];

        get simpleRepresentation() {
            return this.underlying;
        }

        constructor(readonly type: Type.Type) {

        }

        push(v: Value) {
            return this.underlying.push(v);
        }

        pop() {
            return this.underlying.pop();
        }

        index(n: number, newValue?: Value) {
            if (newValue) {
                return this.underlying[n] = newValue;
            } else {
                return this.underlying[n];
            }
        }
    }

    export class MapManager implements Manager {
        private underlying: Map<Value, Value> = new Map();

        get simpleRepresentation() {
            return {
                kind: "es6-map-object",
                entries: [...this.underlying.entries()]
            };
        }

        constructor(readonly keyType: Type.Type, readonly valueType: Type.Type, readonly environment: Environment) {

        }

        has(k: Value) {
            if (!Type.isSubtype(k.type, this.keyType)) {
                throw new Error("invalid key");
            }
            return this.underlying.has(k);
        }

        get(k: Value) {
            if (!Type.isSubtype(k.type, this.keyType)) {
                throw new Error("invalid key");
            }
            return this.underlying.get(k);
        }

        set(k: Value, v: Value) {
            if (!Type.isSubtype(k.type, this.keyType)) {
                throw new Error("invalid key");
            }
            if (!Type.isSubtype(v.type, this.valueType)) {
                throw new Error("invalid value");
            }
            this.environment.add(k);
            this.environment.add(v);
            return this.underlying.set(k, v);
        }
    }

    export class MethodManager implements Manager {
        simpleRepresentation: any = {};

        constructor(readonly type: Type.CustomObject, readonly environment: Environment) {

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
            const returnValue = method.implementation.call(this.simpleRepresentation, ...args) as void | Value;
            if (method.returnType) {
                if (!returnValue || !Type.isSubtype(returnValue.type, method.returnType)) {
                    throw new Error("returned incompatible value");
                }
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
            this.simpleRepresentation[name] = value;
        }
    }
}