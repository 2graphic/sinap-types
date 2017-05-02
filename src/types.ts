import { setEquivalent, mapEquivalent, minimizeTypeArray, imap } from "./util";
import { Value } from ".";

export namespace Type {

    export interface MetaType {
        readonly name: string;
        intersect?(types: Iterable<Type>, seenBefore: [Set<Type>, Type][]): Type;
    }
    export interface Type {
        readonly name: string;
        metaType: MetaType;
        equals(other: Type): boolean;
        isSubtype?(other: Type): boolean;
    }

    export type PrimitiveTS = string | number | boolean;
    export type PrimitiveName = "string" | "number" | "boolean" | "color" | "file";

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
                return a.isSubtype(b);
            } else {
                for (const utype of b.types) {
                    if (Type.isSubtype(a, utype)) {
                        return true;
                    }
                }
                return false;
            }
        } else if (a.isSubtype) {
            return a.isSubtype(b);
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

    function inferPrettyName(key: string) {
        return key[0].toUpperCase() + key.substr(1).replace(/([a-z])([A-Z])/g, "$1 $2");
    }

    export interface RecordLike {
        readonly members: Map<string, Type>;
        prettyName(key: string): string;
        isVisible(key: string): boolean;
    }

    const RecordMetaType: MetaType = {
        name: "Record"
    };


    export class Record implements Type, RecordLike {
        metaType = RecordMetaType;
        name: "Record";

        constructor(
            readonly members: Map<string, Type>,
            private prettyNames = new Map<string, string>(),
            private visibility = new Map<string, boolean>(),
        ) {
        }

        prettyName(key: string) {
            return this.prettyNames.get(key) || inferPrettyName(key);
        }

        isVisible(key: string) {
            return this.visibility.get(key) !== false;
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

    export type FunctionObject = {
        argTypes: Type.Type[],
        returnType: Type.Type | null,
        implementation: (...args: Value.Value[]) => Value.Value | void
    };

    export type MethodObject = {
        argTypes: Type.Type[],
        returnType: Type.Type | null,
        isGetter: boolean,
        implementation: (this: Value.CustomObject, ...args: Value.Value[]) => Value.Value | void
    };

    const CustomObjectMetaType: MetaType = {
        name: "CustomObject"
    };

    export class CustomObject implements Type, RecordLike {
        metaType = CustomObjectMetaType;

        constructor(
            readonly name: string,
            readonly superType: CustomObject | null,
            readonly members: Map<string, Type>,
            readonly methods = new Map<string, MethodObject>(),
            readonly _prettyNames = new Map<string, string>(),
            readonly _visibility = new Map<string, boolean>(),
        ) {
        }

        prettyName(key: string) {
            return this._prettyNames.get(key) || inferPrettyName(key);
        }

        isVisible(key: string) {
            return this._visibility.get(key) !== false;
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
            this.name = [...imap(t => t.name, this.types)].join(" | ");
        }

        equals(that: Type): boolean {
            return that instanceof Union && setEquivalent(this.types, that.types, (a, b) => a.equals(b));
        }

        isSubtype(that: Type) {
            if (that instanceof Union) {
                for (const ta of this.types) {
                    let found = false;
                    for (const tb of that.types) {
                        if (Type.isSubtype(ta, tb)) {
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
        constructor(types: Iterable<Type>, mappings: [Set<Type>, Type][] = []) {
            for (const t of types) {
                if (t instanceof CustomObject) {
                    this.types.add(t);
                } else {
                    throw new Error("can only intersect CustomObjects");
                }
            }
            this.name = [...imap(t => t.name, this.types)].join(" & ");

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

            // todo: how to do this if the type changes...
            for (const [key, originalTypes] of keyTypes) {
                const intersected = intersectTypes(originalTypes, mappings);
                this.members.set(key, intersected);
            }
        }

        prettyName(key: string) {
            for (const type of this.types) {
                const name = type._prettyNames.get(key);
                if (name) {
                    return name;
                }
            }
            return inferPrettyName(key);
        }

        isVisible(key: string) {
            for (const type of this.types) {
                const name = type._visibility.get(key);
                if (name !== undefined) {
                    return name;
                }
            }
            return true;
        }

        equals(that: Type): boolean {
            return that instanceof Intersection && setEquivalent(this.types, that.types, (a, b) => a.equals(b));
        }
    }

    export function intersectTypes(originalTypes: Iterable<Type>, mappings: [Set<Type>, Type][]) {
        const typeArray = minimizeTypeArray(originalTypes);

        const types = new Set(typeArray);
        for (const [set, type] of mappings) {
            if (setEquivalent(types, set)) {
                return type;
            }
        }

        const [firstType, ...restTypes] = types;

        if (restTypes.length === 0) {
            return firstType;
        } else if (restTypes.filter(t => t.metaType !== firstType.metaType).length === 0) {
            if (firstType.metaType === CustomObjectMetaType) {
                // make a new object that will represent the intersection as a placeholder
                // this breaks the otherwise infinite recursion
                const inter: Intersection = ({} as any);
                mappings.push([types, inter]);
                // setup the intersection (it can possibly depend on itself)
                const type = new Intersection(types as Set<CustomObject>, mappings);
                // grab all the info from the newly built type
                Object.assign(inter, type);
                // and make inheritence and instanceof work
                (inter as any).__proto__ = (type as any).__proto__;
                return inter;
            } else if (firstType.metaType.intersect) {
                return firstType.metaType.intersect(types, mappings);
            }
        }

        throw new Error(`can't intersect types`);
    }

    export type TypeType = typeof Literal | typeof Primitive | typeof CustomObject | typeof Intersection | typeof Union | typeof Record;

}