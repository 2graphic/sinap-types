export namespace Type {

    export interface Type {
        readonly name: string;
        equals(other: Type): boolean;
    }

    export type PrimitiveTS = string | number | boolean;
    export type PrimitiveName = "string" | "number" | "boolean";

    export function isSubtype(a: Type, b: Type): boolean {
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
        } else if (a instanceof Primitive) {
            return a.equals(b);
        } else if (a instanceof Literal) {
            if (b instanceof Primitive) {
                return isSubtype(a.superType, b);
            } else {
                return a.equals(b);
            }
        } else if (a instanceof Record) {
            if (b instanceof Record) {
                return mapEquivalent(a.members, b.members, (a, b) => isSubtype(a, b));
            } else {
                return false;
            }
        } else if (a instanceof SimpleObject) {
            if (a.equals(b)) {
                return true;
            } else if (a.superType) {
                return isSubtype(a.superType, b);
            } else {
                return false;
            }
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
    }

    // TODO: move these functions to a Util library
    export function mapEquivalent<K, V>(a: Map<K, V>, b: Map<K, V>, equals: (a: V, b: V) => boolean) {
        if (a.size !== b.size) {
            return false;
        }
        for (const [k, v] of a.entries()) {
            if (!b.has(k)) {
                return false;
            }
            if (!equals(v, b.get(k)!)) {
                return false;
            }
        }
        return true;
    }

    export function setEquivalent<V>(a: Set<V>, b: Set<V>): boolean {
        if (a.size !== b.size) {
            return false;
        }
        for (const c of a.values()) {
            if (!b.has(c)) {
                return false;
            }
        }
        return true;
    }


    function makePrettyNames(members: Iterable<string>, prettyNames?: Map<string, string>) {
        if (!prettyNames) {
            prettyNames = new Map();
        }
        for (const key of members) {
            if (!prettyNames.has(key)) {
                prettyNames.set(key, key[0].toUpperCase() + key.substr(1).replace(/([a-z])([A-Z])/g, "$1 $2"));
            }
        }
        return prettyNames;
    }

    function makeVisibility(members: Iterable<string>, visibility?: Map<string, boolean>) {
        if (!visibility) {
            visibility = new Map();
        }
        for (const key of members) {
            if (!visibility.has(key)) {
                visibility.set(key, true);
            }
        }
        return visibility;
    }

    export interface RecordLike {
        readonly members: Map<string, Type>;
        readonly prettyNames: Map<string, string>;
        readonly visibility: Map<string, boolean>;
    }

    export class Record implements Type, RecordLike {
        readonly prettyNames: Map<string, string>;
        readonly visibility: Map<string, boolean>;
        constructor(
            readonly name: string,
            readonly members: Map<string, Type>,
            prettyNames?: Map<string, string>,
            visibility?: Map<string, boolean>,
        ) {
            this.prettyNames = makePrettyNames(this.members.keys(), prettyNames);
            this.visibility = makeVisibility(this.members.keys(), visibility);
        }

        equals(that: Type): boolean {
            return that instanceof Record
                && this.name === that.name
                && mapEquivalent(this.members, that.members, (a, b) => a.equals(b));
        }
    }

    export class SimpleObject implements Type, RecordLike {
        readonly prettyNames: Map<string, string>;
        readonly visibility: Map<string, boolean>;
        constructor(
            readonly name: string,
            readonly members: Map<string, Type>,
            readonly superType?: SimpleObject,
            prettyNames?: Map<string, string>,
            visibility?: Map<string, boolean>,
        ) {
            this.prettyNames = makePrettyNames(this.members.keys(), prettyNames);
            this.visibility = makeVisibility(this.members.keys(), visibility);
        }

        equals(that: Type): boolean {
            return this === that;
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
        readonly types: Set<SimpleObject>;
        constructor(types: Iterable<SimpleObject>) {
            this.types = new Set(types);
            this.name = [...this.types.values()].map(t => t.name).join(" & ");
        }

        equals(that: Type): boolean {
            return that instanceof Intersection && setEquivalent(this.types, that.types);
        }
    }

}