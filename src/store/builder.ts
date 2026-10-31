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
  /** asks the canvas to move its viewport; `n` makes repeated identical requests distinct */
  viewRequest: { kind: "start" | "fit" | "apps"; n: number };
  requestView: (kind: "start" | "fit" | "apps") => void;
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

/** App cards are bigger than plain steps: the logo is the point. */
export const APP_SIZE = { w: 236, h: 92 };
export const STEP_SIZE = { w: 212, h: 72 };
/** vertical centre every stage is laid out around */
export const STAGE_CENTER_Y = 416;
const COL_W = 252;
const ROW_GAP = 16;
/** stages with this many blocks (the app-access stage) become a two-column grid so they can be zoomed into */
const GRID_FROM = 5;

const sizeOf = (key: string) => (BLOCKS[key]?.perm ? APP_SIZE : STEP_SIZE);

function build(p: Persona) {
  const nodes: StepNode[] = [];
  const edges: Edge[] = [];
  let seq = 0;
  let prev: StepNode[] = [];
  let x = 60;
  genStages(p).forEach((stage) => {
    const count = stage.items.length;
    const cols = count >= GRID_FROM ? 2 : 1;
    const rows = Math.ceil(count / cols);
    // column-major fill; each column is centred on the stage centre line
    const colItems = (c: number) => stage.items.slice(c * rows, (c + 1) * rows);
    const cur: StepNode[] = [];
    for (let c = 0; c < cols; c++) {
      const items = colItems(c);
      const total = items.reduce((s, it) => s + sizeOf(it.key).h, 0) + (items.length - 1) * ROW_GAP;
      let y = STAGE_CENTER_Y - total / 2;
      for (const it of items) {
        cur.push({
          id: `n${++seq}`,
          type: "step",
          position: { x: x + c * COL_W, y },
          data: resolveSpec(it, stage.day, p.level) as StepData,
        });
        y += sizeOf(it.key).h + ROW_GAP;
      }
    }
    x += cols * COL_W;
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
  viewRequest: { kind: "start", n: 0 },
  requestView: (kind) => set((s) => ({ viewRequest: { kind, n: s.viewRequest.n + 1 } })),

  loadPersona: (persona) => set((s) => ({ persona, ...build(persona), selectedId: null, picker: null, viewRequest: { kind: "start", n: s.viewRequest.n + 1 } })),

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

