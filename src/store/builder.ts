import { create } from "zustand";
import {
  addEdge, applyEdgeChanges, applyNodeChanges,
  type Connection, type Edge, type EdgeChange, type Node, type NodeChange,
} from "@xyflow/react";
import { BLOCKS, PACKS } from "@/lib/catalog";
import { defaultPerm, genStages, resolveSpec, type Persona, type Step } from "@/lib/workflow";

export type StepData = Step & Record<string, unknown>;
export type StepNode = Node<StepData, "step">;

interface Picker { edgeId: string; x: number; y: number }

interface BuilderState {
  persona: Persona;
  nodes: StepNode[];
  edges: Edge[];
  selectedId: string | null;
  picker: Picker | null;
  /** bumps whenever the canvas should re-fit (persona switch) */
  fitToken: number;
  seq: number;
  loadPersona: (p: Persona) => void;
  onNodesChange: (c: NodeChange<StepNode>[]) => void;
  onEdgesChange: (c: EdgeChange[]) => void;
  onConnect: (c: Connection) => void;
  select: (id: string | null) => void;
  addBlock: (key: string, pos: { x: number; y: number }) => void;
  addPack: (name: string, pos: { x: number; y: number }) => void;
  insertOnEdge: (edgeId: string, key: string) => void;
  updateStep: (id: string, patch: Partial<Step>) => void;
  deleteStep: (id: string) => void;
  openPicker: (p: Picker | null) => void;
}

const edgeOf = (source: string, target: string): Edge => ({ id: `e-${source}-${target}`, source, target, type: "insert" });

function build(p: Persona) {
  const nodes: StepNode[] = [];
  const edges: Edge[] = [];
  let seq = 0;
  let prev: StepNode[] = [];
  genStages(p).forEach((stage, si) => {
    const cur: StepNode[] = stage.items.map((it, j) => ({
      id: `n${++seq}`,
      type: "step",
      position: { x: 60 + si * 250, y: 380 - (stage.items.length - 1) * 45 + j * 90 },
      data: resolveSpec(it, stage.day, p.level) as StepData,
    }));
    cur.forEach((n, j) => {
      if (!prev.length) return;
      if (cur.length === 1) prev.forEach((a) => edges.push(edgeOf(a.id, n.id)));
      else if (prev.length === 1) edges.push(edgeOf(prev[0].id, n.id));
      else edges.push(edgeOf(prev[j % prev.length].id, n.id));
    });
    nodes.push(...cur);
    prev = cur;
  });
  return { nodes, edges, seq };
}

const newStep = (key: string, level: Persona["level"], day?: number): StepData => {
  const b = BLOCKS[key];
  return {
    key, title: b.name, owner: b.owner, day: day ?? b.day,
    perm: b.perm ? defaultPerm(level, b.cat) : null,
    ver: key === "approve" ? [b.owner] : [], rem: "ladder",
  };
};

const initial = build({ type: "Full-time", dept: "Engineering", level: "Mid" });

export const useBuilder = create<BuilderState>((set) => ({
  persona: { type: "Full-time", dept: "Engineering", level: "Mid" },
  ...initial,
  selectedId: null,
  picker: null,
  fitToken: 0,

  loadPersona: (persona) => set((s) => ({ persona, ...build(persona), selectedId: null, picker: null, fitToken: s.fitToken + 1 })),

  onNodesChange: (changes) => set((s) => ({ nodes: applyNodeChanges(changes, s.nodes) })),
  onEdgesChange: (changes) => set((s) => ({ edges: applyEdgeChanges(changes, s.edges) })),
  onConnect: (c) => set((s) => ({ edges: addEdge({ ...c, type: "insert" }, s.edges) })),

  select: (id) => set((s) => ({ selectedId: id, nodes: s.nodes.map((n) => ({ ...n, selected: n.id === id })) })),

  addBlock: (key, pos) =>
    set((s) => {
      const id = `n${s.seq + 1}`;
      const node: StepNode = { id, type: "step", position: pos, data: newStep(key, s.persona.level), selected: true };
      return { seq: s.seq + 1, selectedId: id, nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), node] };
    }),

  addPack: (name, pos) =>
    set((s) => {
      const pack = PACKS.find((p) => p.name === name);
      if (!pack) return {};
      let seq = s.seq;
      const added: StepNode[] = pack.keys.map((key, i) => ({
        id: `n${++seq}`, type: "step", position: { x: pos.x, y: pos.y + i * 90 }, data: newStep(key, s.persona.level),
      }));
      const edges = s.selectedId ? [...s.edges, ...added.map((n) => edgeOf(s.selectedId!, n.id))] : s.edges;
      return { seq, nodes: [...s.nodes, ...added], edges };
    }),

  insertOnEdge: (edgeId, key) =>
    set((s) => {
      const e = s.edges.find((x) => x.id === edgeId);
      if (!e) return {};
      const a = s.nodes.find((n) => n.id === e.source)!;
      const b = s.nodes.find((n) => n.id === e.target)!;
      const id = `n${s.seq + 1}`;
      const node: StepNode = {
        id, type: "step", selected: true,
        position: { x: (a.position.x + b.position.x) / 2, y: (a.position.y + b.position.y) / 2 + 70 },
        data: newStep(key, s.persona.level, Math.round((a.data.day + b.data.day) / 2)),
      };
      return {
        seq: s.seq + 1, selectedId: id, picker: null,
        nodes: [...s.nodes.map((n) => ({ ...n, selected: false })), node],
        edges: [...s.edges.filter((x) => x.id !== edgeId), edgeOf(a.id, id), edgeOf(id, b.id)],
      };
    }),

  updateStep: (id, patch) => set((s) => ({ nodes: s.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) })),

  deleteStep: (id) =>
    set((s) => {
      const incoming = s.edges.filter((e) => e.target === id);
      const outgoing = s.edges.filter((e) => e.source === id);
      const bridged = incoming.flatMap((i) => outgoing.map((o) => edgeOf(i.source, o.target)));
      return {
        selectedId: null,
        nodes: s.nodes.filter((n) => n.id !== id),
        edges: [...s.edges.filter((e) => e.source !== id && e.target !== id), ...bridged],
      };
    }),

  openPicker: (picker) => set({ picker }),
}));

