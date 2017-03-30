/// <reference path="./typings/index.d.ts" />

import { expect } from "chai";
import { Type } from ".";
import { Value } from ".";

describe("Values", () => {
    it("deps", () => {
        const env = new Value.Environment();
        const deps = Value.dependecies({
            uuid: "1",
            environment: env,
            deepEqual: () => false,
            type: new Type.Literal(1),
            serialRepresentation: [
                { kind: "value-reference", uuid: "123" },
                { k: { v: { kind: "value-reference", uuid: "2883" } } }]
        });
        expect(deps).to.deep.equal(["123", "2883"]);
    });

    describe("literals and primitives", () => {
        it("literals", () => {
            const env = new Value.Environment();
            const t1 = new Type.Literal(1);
            const l1 = new Value.Literal(t1, env);
            expect(l1.serialRepresentation).to.equal(1);

            const tHello = new Type.Literal("hello");
            const lHello = new Value.Literal(tHello, env);
            expect(lHello.serialRepresentation).to.equal("hello");
        });

        it("primitives", () => {
            const env = new Value.Environment();
            const tNumber = new Type.Primitive("number");
            const pNumber = new Value.Primitive(tNumber, env, 17);
            expect(pNumber.serialRepresentation).to.equal(17);
            pNumber.value = 14;
            expect(pNumber.serialRepresentation).to.equal(14);
        });
    });

    describe("Records", () => {
        it("simple", () => {
            const env = new Value.Environment();
            const t = new Type.Record("r1", new Map([["l", new Type.Primitive("number")]]));
            const v = new Value.Record(t, env);
            expect(v.serialRepresentation.l.kind).to.deep.equal("value-reference");
            expect(v.serialRepresentation.l).to.have.property("uuid");
            const l = v.value.l;
            expect(l instanceof Value.Primitive && l.value).to.equal(0);
        });
    });

    describe("Custom Objects", () => {
        it("Map", () => {
            const env = new Value.Environment();
            const tnumber = new Type.Primitive("number"), tstring = new Type.Primitive("string");
            const manager = new Value.MapManager(tnumber, tstring, env);
            const v = new Value.CustomObject(manager, env);
            v.manager.set(new Value.Primitive(tnumber, env, 1), new Value.Primitive(tstring, env, "Hello"));
            const rep = v.serialRepresentation;
            expect(rep.kind).to.equal("es6-map-object");
            expect(rep.entries.length).to.equal(1);
            expect(rep.entries[0].length).to.equal(2);
            expect(env.fromReference(rep.entries[0][0]).serialRepresentation).to.equal(1);
            expect(env.fromReference(rep.entries[0][1]).serialRepresentation).to.equal("Hello");
        });

        describe("method manager", () => {
            it("can call a function", () => {
                const env = new Value.Environment();
                const tnumber = new Type.Primitive("number");
                const tA = new Type.CustomObject("A", null, new Map([["foo", tnumber]]), new Map([
                    ["func", {
                        argTypes: [tnumber],
                        returnType: null,
                        implementation: function(this: any, a: Value.Value) {
                            this.foo = a;
                        }
                    }]
                ]));
                const a = Value.makeObject(tA, env);
                const prim = new Value.Primitive(tnumber, env, 17);
                a.manager.call("func", prim);

                expect(a.serialRepresentation)
                    .to.deep.equal({ foo: env.toReference(prim) });

                const prim2 = new Value.Primitive(tnumber, env, 14);
                a.manager.set("foo", prim2);
                expect(a.serialRepresentation)
                    .to.deep.equal({ foo: env.toReference(prim2) });

                expect(a.manager.get("foo").serialRepresentation).to.equal(14);
            });
            it("can get/set values", () => {
                const env = new Value.Environment();
                const tnumber = new Type.Primitive("number");
                const tA = new Type.CustomObject("A", null, new Map([["foo", tnumber]]));
                const a = Value.makeObject(tA, env);

                const prim = new Value.Primitive(tnumber, env, 14);
                a.manager.set("foo", prim);
                expect(a.serialRepresentation)
                    .to.deep.equal({ foo: env.toReference(prim) });

                expect(a.manager.get("foo").serialRepresentation).to.equal(14);
            });
            it("can get a return value", () => {
                const env = new Value.Environment();
                const tnumber = new Type.Primitive("number"), tstring = new Type.Primitive("string");
                const tA = new Type.CustomObject("A", null, new Map([["foo", tnumber]]), new Map([
                    ["func", {
                        argTypes: [],
                        returnType: tstring,
                        implementation: function(this: any) {
                            return new Value.Primitive(tstring, env, "Hi");
                        }
                    }]
                ]));
                const a = Value.makeObject(tA, env);
                const result = a.manager.call("func")!;

                expect(result.serialRepresentation)
                    .to.equal("Hi");
            });
        });
    });

    describe("deep equal", () => {
        const tnumber = new Type.Primitive("number"), tstring = new Type.Primitive("string");
        const trec1 = new Type.Record("rec1", new Map([["a", tnumber]]));
        it("equates primitives", () => {
            const env = new Value.Environment();
            const n1a = new Value.Primitive(tnumber, env, 1);
            const n1b = new Value.Primitive(tnumber, env, 1);
            const n2 = new Value.Primitive(tnumber, env, 2);
            const sAa = new Value.Primitive(tstring, env, "A");
            const sAb = new Value.Primitive(tstring, env, "A");
            const sB = new Value.Primitive(tstring, env, "B");

            expect(n1a.deepEqual(n1a)).to.be.true;
            expect(n1a.deepEqual(n1b)).to.be.true;
            expect(n1a.deepEqual(n2)).to.be.false;

            expect(sAa.deepEqual(sAa)).to.be.true;
            expect(sAa.deepEqual(sAb)).to.be.true;
            expect(sAa.deepEqual(sB)).to.be.false;

            expect(n1a.deepEqual(sB)).to.be.false;
        });
        it("equates records", () => {
            const env = new Value.Environment();
            const n1a = new Value.Primitive(tnumber, env, 1);
            const n1b = new Value.Primitive(tnumber, env, 1);
            const n2 = new Value.Primitive(tnumber, env, 2);

            const r1aa = new Value.Record(trec1, env);
            const r1ab = new Value.Record(trec1, env);
            const r1b = new Value.Record(trec1, env);
            const r2 = new Value.Record(trec1, env);

            r1aa.value.a = n1a;
            r1ab.value.a = n1a;
            r1b.value.a = n1b;
            r2.value.a = n2;

            // checks if deep equal works even through different uuids
            expect(r1aa.deepEqual(r1aa)).to.be.true;
            expect(r1aa.deepEqual(r1ab)).to.be.true;
            expect(r1aa.deepEqual(r1b)).to.be.true;
            expect(r1aa.deepEqual(r2)).to.be.false;
        });

        it("short circuits", () => {
            const env = new Value.Environment();
            const n1 = new Value.Primitive(tnumber, env, 1);
            const n2 = new Value.Primitive(tnumber, env, 2);
            (n1 as any).uuid = "1";
            (n2 as any).uuid = "1";

            expect(n1.deepEqual(n2)).to.be.true;
        });

        it("short circuits (deep)", () => {
            const env = new Value.Environment();
            const n1 = new Value.Primitive(tnumber, env, 1);
            const n2 = new Value.Primitive(tnumber, env, 2);
            const r1 = new Value.Record(trec1, env);
            const r2 = new Value.Record(trec1, env);

            (n1 as any).uuid = "1";
            (n2 as any).uuid = "1";

            r1.value.a = n1;
            r2.value.a = n2;

            expect(n1.deepEqual(n2)).to.be.true;
        });

        it("short circuits (deep) (helper)", () => {
            // (validate that it is the matching UUIDs doing it)
            const env = new Value.Environment();
            const n1 = new Value.Primitive(tnumber, env, 1);
            const n2 = new Value.Primitive(tnumber, env, 2);
            const r1 = new Value.Record(trec1, env);
            const r2 = new Value.Record(trec1, env);

            r1.value.a = n1;
            r2.value.a = n2;

            expect(n1.deepEqual(n2)).to.be.false;
        });
    });
});