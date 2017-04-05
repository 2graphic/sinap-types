/// <reference path="../typings/index.d.ts" />

import { expect } from "chai";
import { Type } from "./index";

describe("Types", () => {
    describe("Subtype", () => {
        describe("primitives and literals", () => {
            it("'a' < string", () => {
                expect(Type.isSubtype(new Type.Literal("a"), new Type.Primitive("string"))).to.be.true;
            });
            it("! 2 < string", () => {
                expect(Type.isSubtype(new Type.Literal(2), new Type.Primitive("string"))).to.be.false;
            });
            it("! 'a' < boolean", () => {
                expect(Type.isSubtype(new Type.Literal('a'), new Type.Primitive("boolean"))).to.be.false;
            });
            it("! 0 < boolean", () => {
                expect(Type.isSubtype(new Type.Literal(0), new Type.Primitive("boolean"))).to.be.false;
            });
            it("true < boolean", () => {
                expect(Type.isSubtype(new Type.Literal(true), new Type.Primitive("boolean"))).to.be.true;
            });
            it("false < boolean", () => {
                expect(Type.isSubtype(new Type.Literal(false), new Type.Primitive("boolean"))).to.be.true;
            });
            it("7 < number", () => {
                expect(Type.isSubtype(new Type.Literal(7), new Type.Primitive("number"))).to.be.true;
            });
            it("string < string", () => {
                expect(Type.isSubtype(new Type.Primitive("string"), new Type.Primitive("string"))).to.be.true;
            });
            it("number < number", () => {
                expect(Type.isSubtype(new Type.Primitive("number"), new Type.Primitive("number"))).to.be.true;
            });
            it("boolean < boolean", () => {
                expect(Type.isSubtype(new Type.Primitive("boolean"), new Type.Primitive("boolean"))).to.be.true;
            });
            it("! number < string", () => {
                expect(Type.isSubtype(new Type.Primitive("number"), new Type.Primitive("string"))).to.be.false;
            });
            it("! boolean < number", () => {
                expect(Type.isSubtype(new Type.Primitive("boolean"), new Type.Primitive("number"))).to.be.false;
            });
            it("! number < boolean", () => {
                expect(Type.isSubtype(new Type.Primitive("number"), new Type.Primitive("boolean"))).to.be.false;
            });
        });
        describe("Record", () => {
            it("test 1", () => {
                expect(Type.isSubtype(
                    new Type.Record("Rec1", new Map([["a", new Type.Literal(4)]])),
                    new Type.Record("Rec2", new Map([["a", new Type.Literal(4)]])))
                ).to.be.true;

                expect(Type.isSubtype(
                    new Type.Record("Rec1", new Map([["a", new Type.Literal(4)]])),
                    new Type.Record("Rec2", new Map([["a", new Type.Primitive("number")]])))
                ).to.be.true;

                expect(Type.isSubtype(
                    new Type.Record("Rec1", new Map([["a", new Type.Literal(4)]])),
                    new Type.Record("Rec2", new Map([["a", new Type.Literal(7)]])))
                ).to.be.false;

                expect(Type.isSubtype(
                    new Type.Record("Rec1", new Map([["a", new Type.Literal(4)]])),
                    new Type.Record("Rec2", new Map([["b", new Type.Literal(4)]])))
                ).to.be.false;
            });
        });
        describe("Simple Object", () => {
            it("identity", () => {
                const obj1 = new Type.CustomObject("Obj1", null, new Map([["a", new Type.Literal(4)]]));
                expect(Type.isSubtype(obj1, obj1)).to.be.true;
            });
            it("recursive 1", () => {
                const obj1 = new Type.CustomObject("Obj1", null, new Map([["a", new Type.Literal(4)]]));
                const obj2 = new Type.CustomObject("Obj2", obj1, new Map([["a", new Type.Literal(4)]]));
                expect(Type.isSubtype(obj2, obj1)).to.be.true;
                expect(Type.isSubtype(obj1, obj2)).to.be.false;
            });
            it("recursive 2", () => {
                const obj1 = new Type.CustomObject("Obj1", null, new Map([["a", new Type.Literal(4)]]));
                const obj2 = new Type.CustomObject("Obj2", obj1, new Map([["a", new Type.Literal(4)]]));
                const obj3 = new Type.CustomObject("Obj3", obj2, new Map([["a", new Type.Literal(4)]]));
                expect(Type.isSubtype(obj3, obj1)).to.be.true;
                expect(Type.isSubtype(obj2, obj1)).to.be.true;
                expect(Type.isSubtype(obj1, obj2)).to.be.false;
                expect(Type.isSubtype(obj1, obj3)).to.be.false;
                expect(Type.isSubtype(obj2, obj3)).to.be.false;
            });
        });
        describe("Union", () => {
            const t1 = new Type.Literal(1);
            const t2 = new Type.Literal(2);
            const t3 = new Type.Literal(3);
            const t4 = new Type.Literal(4);
            const u12a = new Type.Union([t1, t2]);
            const u12b = new Type.Union([t1, t2]);
            const u123 = new Type.Union([t1, t2, t3]);
            const u1234 = new Type.Union([t1, t2, t3, t4]);
            const u23 = new Type.Union([t2, t3]);
            const u34 = new Type.Union([t3, t4]);
            const tnum = new Type.Primitive("number");
            const tstring = new Type.Primitive("string");

            it("equal", () => {
                expect(Type.isSubtype(u12a, u12a)).to.be.true;
                expect(Type.isSubtype(u12a, u12b)).to.be.true;
            });

            it("more", () => {
                expect(Type.isSubtype(u12a, u123)).to.be.true;
                expect(Type.isSubtype(u12a, u1234)).to.be.true;
            });

            it("less", () => {
                expect(Type.isSubtype(u123, u12a)).to.be.false;
                expect(Type.isSubtype(u1234, u12a)).to.be.false;
            });

            it("disjoint", () => {
                expect(Type.isSubtype(u23, u12a)).to.be.false;
                expect(Type.isSubtype(u34, u12a)).to.be.false;
                expect(Type.isSubtype(u12a, u23)).to.be.false;
                expect(Type.isSubtype(u12a, u34)).to.be.false;
            });

            it("external subtype", () => {
                expect(Type.isSubtype(u12a, tnum)).to.be.true;
                expect(Type.isSubtype(tnum, u12a)).to.be.false;
                expect(Type.isSubtype(u12a, tstring)).to.be.false;
            });
        });
        describe("Intersection", () => {
            const t1 = new Type.CustomObject("Obj1", null, new Map());
            const t2 = new Type.CustomObject("Obj2", null, new Map());
            const t3 = new Type.CustomObject("Obj3", null, new Map());
            const t4 = new Type.CustomObject("Obj4", null, new Map());
            const t11 = new Type.CustomObject("Obj11", t1, new Map());
            const i12a = new Type.Intersection([t1, t2]);
            const i12b = new Type.Intersection([t1, t2]);
            const i123 = new Type.Intersection([t1, t2, t3]);
            const i1234 = new Type.Intersection([t1, t2, t3, t4]);
            const i23 = new Type.Intersection([t2, t3]);
            const i34 = new Type.Intersection([t3, t4]);
            const i2_11 = new Type.Intersection([t2, t11]);
            const i23_11 = new Type.Intersection([t3, t2, t11]);

            it("handles equal types", () => {
                expect(Type.isSubtype(i12a, i12a)).to.be.true;
                expect(Type.isSubtype(i12a, i12b)).to.be.true;
            });

            it("handles extra types", () => {
                expect(Type.isSubtype(i12a, i123)).to.be.false;
                expect(Type.isSubtype(i12a, i1234)).to.be.false;
            });

            it("handles fewer types", () => {
                expect(Type.isSubtype(i123, i12a)).to.be.true;
                expect(Type.isSubtype(i1234, i12a)).to.be.true;
            });

            it("handles non-matching type sets", () => {
                expect(Type.isSubtype(i23, i12a)).to.be.false;
                expect(Type.isSubtype(i34, i12a)).to.be.false;
                expect(Type.isSubtype(i12a, i23)).to.be.false;
                expect(Type.isSubtype(i12a, i34)).to.be.false;
            });

            it("recurs", () => {
                expect(Type.isSubtype(i2_11, t2)).to.be.true;
                expect(Type.isSubtype(i2_11, t11)).to.be.true;
                expect(Type.isSubtype(i23_11, i2_11)).to.be.true;
            });
        });
    });

    describe("Record", () => {
        it("infers pretty names", () => {
            const rec1 = new Type.Record("Rec1", new Map([["a", new Type.Literal("hello")]]));
            expect(rec1.prettyName('a')).to.equal("A");

            const rec2 = new Type.Record("Rec2", new Map([["helloWorld", new Type.Literal("hello")]]));
            expect(rec2.prettyName("helloWorld")).to.equal("Hello World");

            const rec3 = new Type.Record("Rec3", new Map([
                ["helloWorld", new Type.Literal("hello")],
                ["hiWorld", new Type.Literal("hello")]
            ]), new Map([["hiWorld", "Greet Key"]]));
            expect(rec3.prettyName("helloWorld")).to.equal("Hello World");
            expect(rec3.prettyName("hiWorld")).to.equal("Greet Key");

            const rec4 = new Type.Record("Rec4", new Map([
                ["helloWorld", new Type.Literal("hello")],
                ["hiWorld", new Type.Literal("hello")]
            ]));
            expect(rec4.prettyName("hiWorld")).to.equal("Hi World");
            expect(rec4.prettyName("helloWorld")).to.equal("Hello World");
        });
    });

    describe("Intersection", () => {
        it("merges members", () => {
            const tstring = new Type.Primitive("string");
            const tHello = new Type.Literal("hello");
            const Obj1 = new Type.CustomObject("Obj1", null, new Map<string, Type.Type>([
                ["a", tstring],
                ["b", tHello],
                ["c", tHello],
            ]));
            const Obj2 = new Type.CustomObject("Obj1", null, new Map<string, Type.Type>([
                ["a", tHello],
                ["b", tstring],
                ["d", tstring],
            ]));

            const inter = new Type.Intersection([Obj1, Obj2]);
            expect(inter.members.get("a")).to.equal(tHello);
            expect(inter.members.get("b")).to.equal(tHello);
            expect(inter.members.get("c")).to.equal(tHello);
            expect(inter.members.get("d")).to.equal(tstring);
        });
        it("recursively intersects CustomObjects", () => {
            const tnumber = new Type.Primitive("number");
            const tA = new Type.CustomObject("A", null, new Map([["num1", tnumber]]));
            const tB = new Type.CustomObject("B", null, new Map([["num2", tnumber]]));
            const tC = new Type.CustomObject("C", null, new Map([["ab", tA]]));
            const tD = new Type.CustomObject("D", null, new Map([["ab", tB]]));

            const tInter = new Type.Intersection([tC, tD]);

            expect(tInter.members.get("ab")).to.be.instanceof(Type.Intersection);
            expect((tInter.members.get("ab") as Type.Intersection).members.get("num1")).to.equal(tnumber);
            expect((tInter.members.get("ab") as Type.Intersection).members.get("num2")).to.equal(tnumber);
        });
    });

    it("literal equals", () => {
        expect((new Type.Literal("a")).equals(new Type.Literal("a"))).to.be.true;
    });
});