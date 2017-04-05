import { Type } from ".";

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

export function setEquivalent<V>(a: Set<V>, b: Set<V>, equals?: (a: V, b: V) => boolean): boolean {
    if (a.size !== b.size) {
        return false;
    }
    for (const c of a.values()) {
        if (!b.has(c)) Found: {
            if (equals) {
                for (const d of b.values()) {
                    if (equals(c, d)) {
                        break Found;
                    }
                }
            }
            return false;
        }
    }
    return true;
}

export function traverse(serial: any, visit: (a: any) => boolean) {
    if (!visit(serial)) {
        return;
    }
    if (typeof (serial) === "object") {
        for (const key in serial) {
            traverse(serial[key], visit);
        }
    }
}

export function deepCopy(serial: any, visit: (a: any) => { replace: boolean, value?: any }, to?: any): any {
    const visitValue = visit(serial);
    if (visitValue.replace) {
        return visitValue.value;
    }
    if (typeof (serial) === "object") {
        if (Array.isArray(serial)) {
            to = to === undefined ? [] : to;
        } else {
            to = to === undefined ? {} : to;
        }
        for (const key in serial) {
            to[key] = deepCopy(serial[key], visit);
        }
        return to;
    } else {
        return serial;
    }
}

/**
 * Check whether a == b, with a chance to control the equality test via comparitor.
 *
 * Should not be used on circular objects
 *
 * @param a
 * @param b
 * @param comparitor should return true or false if result of equality is known, should return "recurse"
 * if you want deepEqual to recurse and check
 */
export function deepEqual(a: any, b: any, comparitor: (a: any, b: any) => true | false | "recurse"): boolean {
    const comparison = comparitor(a, b);
    if (comparison === true || comparison === false) {
        return comparison;
    }

    if (typeof (a) !== "object" || typeof (b) !== "object") {
        return a === b;
    }

    // make sure `a` has all b's keys
    for (const key in b) {
        if (b[key]) {
            if (!a[key]) {
                return false;
            }
        }
    }

    for (const key in a) {
        if (!deepEqual(a[key], b[key], comparitor)) {
            return false;
        }
    }

    return true;
}

/**
 * Make a new array with the minimal amount of types from the Iterable.
 * It the iterable is [A, B, C], and A isSubtype B, then the new array
 * will be [A, C].
 * @param originalTypes
 */
export function minimizeTypeArray(originalTypes: Iterable<Type.Type>) {
    const typeArray = [...originalTypes];
    for (const t1 of typeArray) {
        for (const t2 of typeArray) {
            if (Type.isSubtype(t1, t2)) {
                typeArray[typeArray.indexOf(t2)] = t1;
            }
        }
    }
    return typeArray;
}

export function* imap<T, V>(func: (t: T) => V, inp: Iterable<T>): Iterable<V> {
    for (const element of inp) {
        yield func(element);
    }
}

export function* ifilter<T>(func: (t: T) => boolean, inp: Iterable<T>): Iterable<T> {
    for (const element of inp) {
        if (func(element)) {
            yield element;
        }
    }
}

export function ireduce<T, V>(func: (prev: V, t: T) => V, init: V, inp: Iterable<T>): V {
    let result = init;
    for (const element of inp) {
        result = func(result, element);
    }
    return result;
}