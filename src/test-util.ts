/// <reference path="../typings/index.d.ts" />

import { expect } from "chai";
import { setEquivalent, mapEquivalent, traverse, deepCopy, deepEqual } from "./util";

describe("util", () => {
    it("mapEquivalent", () => {
        expect(mapEquivalent(new Map([["a", "b"]]), new Map([["a", "b"]]), (a, b) => a === b)).to.be.true;
        expect(mapEquivalent(new Map([]), new Map([["a", "b"]]), (a, b) => a === b)).to.be.false;
        expect(mapEquivalent(new Map([["a", "b"]]), new Map([]), (a, b) => a === b)).to.be.false;
        expect(mapEquivalent(new Map([["a", "b"], ['c', 'd']]), new Map([["a", "b"], ['c', 'd']]), (a, b) => a === b)).to.be.true;
        expect(mapEquivalent(new Map([["a", "b"], ['c', 'd']]), new Map([["a", "b"], ['c', 'e']]), (a, b) => a === b)).to.be.false;
        expect(mapEquivalent(new Map([["a", "b"], ['c', 'd']]), new Map([["a", "b"]]), (a, b) => a === b)).to.be.false;
        expect(mapEquivalent(new Map([["a", 7], ['c', 14]]), new Map([["a", 18], ['c', 15]]), (a, b) => a < b)).to.be.true;
        expect(mapEquivalent(new Map([["a", 7], ['c', 14]]), new Map([["a", 18], ['c', 13]]), (a, b) => a < b)).to.be.false;
    });
    it("setEquivalent", () => {
        expect(setEquivalent(new Set([1, 2, 3]), new Set([4, 5, 6]))).to.be.false;
        expect(setEquivalent(new Set([1, 2, 3]), new Set([3, 1, 2]))).to.be.true;
        expect(setEquivalent(new Set([1, 2]), new Set([3, 1, 2]))).to.be.false;
        expect(setEquivalent(new Set([2, 3, 1]), new Set([3, 1, 2]))).to.be.true;
        expect(setEquivalent(new Set([1, 2]), new Set())).to.be.false;
    });

    it("traverse", (done) => {
        const found: any[] = [];
        const src = { a: [1, 2, 3], b: "hi", c: { "you": "world" } };
        const expected = [
            src,
            src["a"],
            src["a"][0],
            src["a"][1],
            src["a"][2],
            src["b"],
            src["c"],
            src["c"]["you"]];

        traverse(src, (a) => {
            found.push(a);
            if (found.length === expected.length) {
                expect(found).to.deep.equal(expected);
                done();
            }
            return true;
        });
    });

    it("deep copy", () => {
        expect(deepCopy({ hello: { world: "y" }, y: 7 }, (x) => {
            if (x.world === "y") {
                return { replace: true, value: { 1: { 2: 3 } } };
            }
            return { replace: false };
        })).to.deep.equal({ hello: { 1: { 2: 3 } }, y: 7 });

        expect(deepCopy([1, 2, 3], (_) => {
            return { replace: false };
        })).to.deep.equal([1, 2, 3]);

        const a = {};
        deepCopy({ a: "b" }, (_) => {
            return { replace: false };
        }, a);
        expect(a).to.deep.equal({ a: "b" });
    });

    describe("deep equal", () => {
        it("simple case", () => {
            const result = deepEqual({
                a: 1,
                b: [2, 4],
            }, {
                    a: 1,
                    b: [2, 4],
                }, () => "recurse");
            expect(result).to.be.true;
        });
        it("object object", () => {
            const result = deepEqual({
                a: 1,
                b: [2, 5],
            }, {
                    a: 1,
                    b: [2, 4],
                }, () => "recurse");
            expect(result).to.be.false;
        });
        it("object number", () => {
            const result = deepEqual({
                a: 1,
                b: [2, 5],
            }, 1, () => "recurse");
            expect(result).to.be.false;
        });
        it("comparitor", () => {
            const result = deepEqual({
                a: 1,
                b: { kind: 1, you: "1" },
                c: { oodles: "goo :)" },
            }, {
                    a: 1,
                    b: { kind: 1, you: "2" },
                    c: { oodles: "goo :)" },
                }, (a, b) => {
                    if (a.kind) {
                        return a.kind === b.kind;
                    }
                    return "recurse";
                });
            expect(result).to.be.true;
        });
        it("comparitor fail", () => {
            const result = deepEqual({
                a: 1,
                b: { kind: 1, you: "1" },
                c: { oodles: "goo :)" },
            }, {
                    a: 1,
                    b: { kind: 1, you: "2" },
                    c: { oodles: "gah :)" },
                }, (a, b) => {
                    if (a.kind) {
                        return a.kind === b.kind;
                    }
                    return "recurse";
                });
            expect(result).to.be.false;
        });
    });

    it("confusing TS behavior", () => {
        // check to see if a new array is made each time
        // hint: it is, this is different from python...
        function testConfusingTSBehavior(x: number[] = []) {
            x.push(1);
            return x;
        }

        expect(testConfusingTSBehavior()).to.deep.equal([1]);
        expect(testConfusingTSBehavior()).to.deep.equal([1]);
        expect(testConfusingTSBehavior()).to.deep.equal([1]);
    });
});