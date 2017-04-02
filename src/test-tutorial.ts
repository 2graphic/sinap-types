/// <reference path="../typings/index.d.ts" />

import { expect } from "chai";
import { Type, Value } from ".";
import { deepCopy } from "./util";

describe("Tutorial", () => {
    describe("Literals and Primitives", () => {
        it("Literals", () => {
            // An environment holds a bunch of Values
            // It is like the old `CoreModel`.
            const env = new Value.Environment();
            // you can retrive values out of the environment
            env.values.get("XXXXX-XXXX-....");

            // If you already have a "reference object" you can query an object
            try {
                env.fromReference({ kind: "value-reference", uuid: "XXXXX-XXXX-...." });
            } catch (err) {
                // the above throws an error because the UUID doesn't exist
            }

            const t1 = new Type.Literal(1);
            const l1 = new Value.Literal(t1, env);

            // you can get a reference object from the environment
            env.toReference(l1); // {kind: "value-reference", uuid: "XXXXX-XXXX-...."}

            // all values have a `serialRepresentation`
            expect(l1.serialRepresentation).to.equal(1);

            const tHello = new Type.Literal("hello");
            const lHello = new Value.Literal(tHello, env);
            expect(lHello.serialRepresentation).to.equal("hello");
        });

        it("Primitives", () => {
            // Probably more interesting than literals, we also have primitive values
            const env = new Value.Environment();

            const tNumber = new Type.Primitive("number"); // can be number, boolean, or string
            const pNumber = new Value.Primitive(tNumber, env, 17);
            expect(pNumber.serialRepresentation).to.equal(17);
            pNumber.value = 14;
            expect(pNumber.serialRepresentation).to.equal(14);
        });
    });

    it("Records", () => {
        // there are several kinds of container objects,
        // the simplest is a Record.
        // Records cannot have methods, or inheritence. They act like c structs

        const env = new Value.Environment();

        const t = new Type.Record("r1", new Map([["l", new Type.Primitive("number")]]));
        const v = new Value.Record(t, env);

        // v.serialRepresentation:
        //   {
        //     l: {
        //       kind: "value-reference",
        //       uuid: "XXXX-X..."
        //     }
        //   }
        expect(v.serialRepresentation.l.kind).to.deep.equal("value-reference");
        expect(v.serialRepresentation.l).to.have.property("uuid");
        const l = v.value.l;
        expect(l instanceof Value.Primitive && l.value).to.equal(0);

        // note that the serial representation ALWAYS used value references and UUIDs, even
        // when dealing with primitives
    });

    describe("Custom Objects", () => {
        it("Map", () => {
            const env = new Value.Environment();
            const tnumber = new Type.Primitive("number"), tstring = new Type.Primitive("string");

            // Map<number, string>
            const map = new Value.MapObject(new Value.MapType(tnumber, tstring), env);

            const p1 = new Value.Primitive(tnumber, env, 1);
            const pHello = new Value.Primitive(tstring, env, "Hello");
            // map.set(1, "Hello")
            map.set(p1, pHello);

            // note the structure of the serial representation
            expect(map.serialRepresentation).to.deep.equal({
                "kind": "es6-map-object",
                "entries": [
                    [env.toReference(p1), env.toReference(pHello)],
                ]
            });
        });

        describe("Custom Object", () => {
            it("can call a function", () => {
                const env = new Value.Environment();
                const tnumber = new Type.Primitive("number");

                // The premise here is that the function definitions are type information
                // even their implementations. When I build the TS plugin connection
                // the implementations of the functions in the type will handle all the
                // IPC. Another connector could be build for Python, etc.

                const tA = new Type.CustomObject("A", null, new Map([["foo", tnumber]]), new Map([
                    ["func", {
                        argTypes: [tnumber],
                        returnType: null,
                        implementation: function(this: Value.CustomObject, a: Value.Value) {
                            this.set("foo", a);
                        }
                    }]
                ]));

                const a = new Value.CustomObject(tA, env);
                const prim = new Value.Primitive(tnumber, env, 17);
                a.call("func", prim);

                expect(a.serialRepresentation)
                    .to.deep.equal({ foo: env.toReference(prim) });

                const prim2 = new Value.Primitive(tnumber, env, 14);
                a.set("foo", prim2);

                expect(a.serialRepresentation).to.deep.equal({ foo: env.toReference(prim2) });

                expect(a.get("foo").serialRepresentation).to.equal(14);
            });
            it("can get/set values", () => {
                const env = new Value.Environment();
                const tnumber = new Type.Primitive("number");
                const tA = new Type.CustomObject("A", null, new Map([["foo", tnumber]]));
                const a = new Value.CustomObject(tA, env);

                const prim = new Value.Primitive(tnumber, env, 14);
                a.set("foo", prim);
                expect(a.serialRepresentation)
                    .to.deep.equal({ foo: env.toReference(prim) });

                expect(a.get("foo").serialRepresentation).to.equal(14);
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
                const a = new Value.CustomObject(tA, env);
                const result = a.call("func")!;

                expect(result.serialRepresentation)
                    .to.equal("Hi");
            });
        });
    });

    describe("deep equal", () => {
        const tnumber = new Type.Primitive("number");
        const trec1 = new Type.Record("rec1", new Map([["a", tnumber]]));

        it("equates records", () => {
            const env = new Value.Environment();
            const n1_a = new Value.Primitive(tnumber, env, 1);
            const n1_b = new Value.Primitive(tnumber, env, 1);

            const r1_a = new Value.Record(trec1, env);
            const r1_b = new Value.Record(trec1, env);
            env.add(r1_a);
            env.add(r1_b);

            r1_a.value.a = n1_a;
            r1_b.value.a = n1_b;

            // checks if deep equal works even through different uuids
            expect(r1_a.deepEqual(r1_b)).to.be.true;

            // omitting most of the tests for the tutorial, see
            // test-values.ts for the rest of them
        });

        it("short circuits", () => {
            const env = new Value.Environment();
            const n1 = new Value.Primitive(tnumber, env, 1);
            const n2 = new Value.Primitive(tnumber, env, 2);
            (n1 as any).uuid = "1";
            (n2 as any).uuid = "1";

            // note that this shouldn't happen in practice,
            // since you can't set the UUID.
            // but it allows 1 == 2 because they're both
            // stored at the same UUID
            // This is good, because that means two nodes with the same
            // UUID will compare equal
            expect(n1.deepEqual(n2)).to.be.true;
        });
    });

    describe("listeners", () => {
        const tnumber = new Type.Primitive("number");
        const trec1 = new Type.Record("rec1", new Map([["a", tnumber]]));
        const trec2 = new Type.Record("rec2", new Map([["b", trec1]]));
        const trec3 = new Type.Record("rec3", new Map([["c", trec2]]));

        it("Records", (done) => {
            const env = new Value.Environment();
            const r = new Value.Record(trec3, env);
            env.add(r);

            env.listen((root, value, other) => {
                expect(root).to.equal(r);
                expect(value).to.equal(p);
                expect(other).to.deep.equal({ from: 0, to: 7 });
                done();
            }, () => true, r);

            const r2 = r.value.c as Value.Record;
            const r3 = r2.value.b as Value.Record;
            const p = r3.value.a as Value.Primitive;

            // calls the above listener, with the full key path, c, b, a
            p.value = 7;
        });

        it("records squash", (done) => {
            const env = new Value.Environment();
            const r = new Value.Record(trec3, env);
            env.add(r);

            const rOrginalChild = (r.value as any).c.value.b.value.a as Value.Record;

            env.listen((root, value, other) => {
                expect(root).to.equal(r);
                expect(value).to.equal(rOrginalChild);
                expect(other).to.deep.equal({ from: 0, to: 7 });
                done();
            }, () => true, r);

            const r2 = new Value.Record(trec2, env);
            const r1 = r2.value.b as Value.Record;
            (r1.value.a as Value.Primitive).value = 7;
            // rather than actually changing "r.c", the record at "r.c"
            // gets updated, which in turn updates r.c.b, then r.c.b.a = 7
            // this can be seen by the behavior of the listeners above
            r.value.c = r2;
        });

        it("map", (done) => {
            const env = new Value.Environment();
            const m = new Value.MapObject(new Value.MapType(tnumber, tnumber), env);
            const n1 = new Value.Primitive(new Type.Primitive("number"), env, 1);
            const n17 = new Value.Primitive(new Type.Primitive("number"), env, 17);
            env.add(m);

            env.listen((root, value, other) => {
                expect(root).to.equal(m);
                expect(value).to.equal(m);
                expect(deepCopy(other, (a) => {
                    if (a instanceof Value.Primitive) {
                        return { replace: true, value: a.value };
                    }
                    return { replace: false };
                })).to.deep.equal({ from: undefined, key: 1, to: 17 });
                done();
            }, () => true, m);

            m.set(n1, n17);
        });

        it("map (deep)", (done) => {
            const env = new Value.Environment();
            const m = new Value.MapObject(new Value.MapType(tnumber, tnumber), env);
            const n1 = new Value.Primitive(new Type.Primitive("number"), env, 1);
            const n17 = new Value.Primitive(new Type.Primitive("number"), env, 17);
            env.add(m);

            m.set(n1, n17);

            env.listen((root, value, other) => {
                expect(root).to.equal(m);
                expect(value).to.equal(n17);
                expect(other).to.deep.equal({ from: 17, to: 14 });
                done();
            }, () => true, m);

            n17.value = 14;
        });
    });
});