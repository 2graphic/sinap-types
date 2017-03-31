import { setEquivalent, mapEquivalent } from "./util";
import { Value } from ".";

export namespace Type {

    export interface Type {
        readonly name: string;
        equals(other: Type): boolean;
        isSubtype?(other: Type): boolean;
    }

    export type PrimitiveTS = string | number | boolean;
    export type PrimitiveName = "string" | "number" | "boolean";

    export function isSubtype(a: Type, b: Type): boolean {
        // TODO: figure out how to deal with types defined elsewhere
        // TODO: ensure all cases are checked
        if (b instanceof Intersection) {
            if (a instanceof Intersection) {
                for (const tb of b.types) {
                    let found = false;
                    for (const ta of a.types) {
                        if (isSubtype(ta, tb)) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        return false;
                    }
                }
                return true;
            } else {
                return false;
            }
        } else if (b instanceof Union) {
            if (a instanceof Union) {
                for (const ta of a.types) {
                    let found = false;
                    for (const tb of b.types) {
                        if (isSubtype(ta, tb)) {
                            found = true;
                            break;
                        }
                    }
                    if (!found) {
                        return false;
                    }
                }
                return true;
            } else {
                for (const t of b.types) {
                    if (isSubtype(a, t)) {
                        return true;
                    }
                }
                return false;
            }
        } else if (a.isSubtype) {
            return a.isSubtype(b);
        } else if (a instanceof Union) {
            for (const t of a.types) {
                if (!isSubtype(t, b)) {
                    return false;
                }
            }
            return true;
        } else if (a instanceof Intersection) {
            for (const t of a.types) {
                if (isSubtype(t, b)) {
                    return true;
                }
            }
            return false;
        } else {
            return false;
        }
    }

    export class Primitive implements Type {
        constructor(readonly name: PrimitiveName) {

        }

        equals(that: Type): boolean {
            return that instanceof Primitive && this.name === that.name;
        }

        isSubtype(that: Type) {
            return this.equals(that);
        }
    }

    export class Literal implements Type {
        readonly name: string;
        readonly superType: Primitive;

        constructor(readonly value: PrimitiveTS) {
            const superType = typeof (value);
            if (superType === "string" || superType === "number" || superType === "boolean") {
                if (superType === "string") {
                    this.name = `"${value}"`;
                } else {
                    this.name = `${value}`;
                }
                this.superType = new Primitive(superType);
            } else {
                throw new Error("Trying to make a literal type that isn't a primitive");
            }
        }

        equals(that: Type): boolean {
            return that instanceof Literal && this.value === that.value;
        }

        isSubtype(that: Type) {
            if (that instanceof Primitive) {
                return isSubtype(this.superType, that);
            } else {
                return this.equals(that);
            }
        }
    }


    function inferPrettyNames(members: Iterable<string>, prettyNames: Map<string, string>) {
        for (const key of members) {
            if (!prettyNames.has(key)) {
                prettyNames.set(key, key[0].toUpperCase() + key.substr(1).replace(/([a-z])([A-Z])/g, "$1 $2"));
            }
        }
    }

    function inferVisibility(members: Iterable<string>, visibility: Map<string, boolean>) {
        for (const key of members) {
            if (!visibility.has(key)) {
                visibility.set(key, true);
            }
        }
    }

    export interface RecordLike {
        readonly members: Map<string, Type>;
        readonly prettyNames: Map<string, string>;
        readonly visibility: Map<string, boolean>;
    }

    export class Record implements Type, RecordLike {
        constructor(
            readonly name: string,
            readonly members: Map<string, Type>,
            readonly prettyNames = new Map<string, string>(),
            readonly visibility = new Map<string, boolean>(),
        ) {
            inferPrettyNames(this.members.keys(), prettyNames);
            inferVisibility(this.members.keys(), visibility);
        }

        equals(that: Type): boolean {
            return that instanceof Record
                && this.name === that.name
                && mapEquivalent(this.members, that.members, (a, b) => a.equals(b));
        }

        isSubtype(that: Type): boolean {
            if (that instanceof Record) {
                return mapEquivalent(this.members, that.members, (a, b) => isSubtype(a, b));
            } else {
                return false;
            }
        }
    }

    export class CustomObject implements Type, RecordLike {
        constructor(
            readonly name: string,
            readonly superType: CustomObject | null,
            readonly members: Map<string, Type>,
            readonly methods = new Map<string,
                {
                    argTypes: Type.Type[],
                    returnType: Type.Type | null,
                    implementation: (this: any, ...args: Value.Value[]) => Value.Value | void
                }>(),
            readonly prettyNames = new Map<string, string>(),
            readonly visibility = new Map<string, boolean>(),
        ) {
            inferPrettyNames(this.members.keys(), prettyNames);
            inferVisibility(this.members.keys(), visibility);
        }

        equals(that: Type): boolean {
            return this === that;
        }
        isSubtype(that: Type): boolean {
            if (this.equals(that)) {
                return true;
            } else if (this.superType) {
                return isSubtype(this.superType, that);
            } else {
                return false;
            }
        }
    }


    export interface UnionOrIntersection {
        readonly types: Set<Type>;
    }

    export class Union implements Type, UnionOrIntersection {
        readonly name: string;
        readonly types: Set<Type>;
        constructor(types: Iterable<Type>) {
            this.types = new Set(types);
            this.name = [...this.types.values()].map(t => t.name).join(" | ");
        }

        equals(that: Type): boolean {
            return that instanceof Union && setEquivalent(this.types, that.types);
        }
    }

    export class Intersection implements Type, UnionOrIntersection {
        readonly name: string;
        readonly types: Set<CustomObject>;
        constructor(types: Iterable<CustomObject>) {
            this.types = new Set(types);
            this.name = [...this.types.values()].map(t => t.name).join(" & ");
        }

        equals(that: Type): boolean {
            return that instanceof Intersection && setEquivalent(this.types, that.types);
        }
    }

    export type MetaType = typeof Literal | typeof Primitive | typeof CustomObject | typeof Intersection | typeof Union | typeof Record;

}