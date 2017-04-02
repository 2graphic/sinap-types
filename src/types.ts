import { setEquivalent, mapEquivalent } from "./util";
import { Value } from ".";

export namespace Type {

    export interface MetaType {
        readonly name: string;
        intersect?(types: Iterable<Type>): Type;
    }
    export interface Type {
        readonly name: string;
        metaType: MetaType;
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

    const PrimitiveMetaType: MetaType = {
        name: "Primitive"
    };

    export class Primitive implements Type {
        metaType = PrimitiveMetaType;

        constructor(readonly name: PrimitiveName) {

        }

        equals(that: Type): boolean {
            return that instanceof Primitive && this.name === that.name;
        }

        isSubtype(that: Type) {
            return this.equals(that);
        }
    }

    const LiteralMetaType: MetaType = {
        name: "Literal"
    };

    export class Literal implements Type {
        metaType = LiteralMetaType;

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

    const RecordMetaType: MetaType = {
        name: "Record"
    };


    export class Record implements Type, RecordLike {
        metaType = RecordMetaType;

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

    const CustomObjectMetaType: MetaType = {
        name: "CustomObject"
    };

    export class CustomObject implements Type, RecordLike {
        metaType = CustomObjectMetaType;

        constructor(
            readonly name: string,
            readonly superType: CustomObject | null,
            readonly members: Map<string, Type>,
            readonly methods = new Map<string,
                {
                    argTypes: Type.Type[],
                    returnType: Type.Type | null,
                    implementation: (this: Value.CustomObject, ...args: Value.Value[]) => Value.Value | void
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

    const UnionMetaType: MetaType = {
        name: "Union"
    };

    export class Union implements Type, UnionOrIntersection {
        metaType = UnionMetaType;
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

    const IntersectionMetaType: MetaType = {
        name: "Intersection"
    };

    export class Intersection implements Type, UnionOrIntersection {
        metaType = IntersectionMetaType;
        readonly name: string;
        readonly types = new Set<CustomObject>();
        readonly members = new Map<string, Type.Type>();

        /**
         *
         * @param types should be an iterable of CustomObject, will throw exception otherwise
         */
        constructor(types: Iterable<Type>) {
            const ts = [...types];
            for (const t of ts) {
                if (t instanceof CustomObject) {
                    this.types.add(t);
                } else {
                    throw new Error("can only intersect CustomObjects");
                }
            }
            this.name = [...this.types.values()].map(t => t.name).join(" & ");

            const keyTypes = new Map<string, Set<Type>>();

            for (const type of this.types) {
                for (const [key, innerType] of type.members) {
                    let set = keyTypes.get(key);
                    if (!set) {
                        set = new Set();
                        keyTypes.set(key, set);
                    }
                    if (innerType instanceof Intersection) {
                        for (const t of innerType.types) {
                            set.add(t);
                        }
                    } else {
                        set.add(innerType);
                    }
                }
            }
            for (const [key, originalTypes] of keyTypes) {
                this.members.set(key, intersectTypes(originalTypes));
            }
        }

        equals(that: Type): boolean {
            return that instanceof Intersection && setEquivalent(this.types, that.types);
        }
    }

    export function intersectTypes(originalTypes: Iterable<Type>) {
        const typeArray = [...originalTypes];
        for (const t1 of typeArray) {
            for (const t2 of typeArray) {
                if (Type.isSubtype(t1, t2)) {
                    typeArray[typeArray.indexOf(t2)] = t1;
                }
            }
        }

        const types = new Set(typeArray);

        const [firstType, ...restTypes] = types;

        if (restTypes.length === 0) {
            return firstType;
        } else if (restTypes.filter(t => t.metaType !== firstType.metaType).length === 0) {
            if (firstType.metaType === CustomObjectMetaType) {
                return new Intersection(types as Set<CustomObject>);
            } else if (firstType.metaType.intersect) {
                return firstType.metaType.intersect(types);
            }
        }
        throw new Error(`can't intersect types`);
    }

    export type TypeType = typeof Literal | typeof Primitive | typeof CustomObject | typeof Intersection | typeof Union | typeof Record;

}