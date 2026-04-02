import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { getSpeakerColor } from "../utils/speaker-colors";

interface Props {
  code: string;
  onClickNode?: (nodeId: string) => void;
}

mermaid.initialize({
  startOnLoad: false,
  theme: "neutral",
  flowchart: {
    useMaxWidth: true,
    htmlLabels: true,
    curve: "basis",
  },
  securityLevel: "loose",
});

let renderCounter = 0;

/**
 * Extract the character node ID from a Mermaid SVG element's id.
 * IDs look like: "mermaid-diagram-3-flowchart-Mrs_Sappleton-2"
 * We want: "Mrs_Sappleton"
 */
function extractNodeId(elId: string): string {
  const m = elId.match(/flowchart-(.+?)-\d+$/);
  return m ? m[1] : elId;
}

/**
 * Extract source and target node IDs from a Mermaid edge data-id.
 * data-id looks like: "L_Mrs_Sappleton_Vera_0" or "L_Framtons_Sister_Mrs_Sappleton_0"
 * We match against known node IDs to find the split point.
 */
function parseEdgeDataId(dataId: string, knownNodes: string[]): [string, string] | null {
  // Remove "L_" prefix and "_N" suffix
  const m = dataId.match(/^L_(.+)_(\d+)$/);
  if (!m) return null;
  const body = m[1];

  // Try all known node pairs to find which ones this edge connects
  for (const from of knownNodes) {
    for (const to of knownNodes) {
      if (from === to) continue;
      if (body === `${from}_${to}`) return [from, to];
    }
  }
  return null;
}

/** Extract edge data-id from a Mermaid element ID like "mermaid-diagram-1-L_Mrs_Sappleton_Vera_0" */
function extractEdgeIdFromElementId(elId: string): string {
  const m = elId.match(/(L_.+_\d+)$/);
  return m ? m[1] : "";
}

/** Get the edge data-id from a g.edgePath element, checking multiple locations */
function getEdgeDataId(ep: Element): string {
  return ep.getAttribute("data-id")
    || ep.querySelector("path")?.getAttribute("data-id")
    || extractEdgeIdFromElementId(ep.id || ep.querySelector("path")?.id || "");
}

export default function MermaidViewer({ code, onClickNode }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const onClickRef = useRef(onClickNode);
  onClickRef.current = onClickNode;

  // Parsed graph data stored in refs for hover effect
  const nodeIdsRef = useRef<string[]>([]);
  const adjRef = useRef<Map<string, Set<string>>>(new Map());
  const edgePairsRef = useRef<{ el: Element; from: string; to: string }[]>([]);
  const labelPairsRef = useRef<{ el: Element; from: string; to: string }[]>([]);

  useEffect(() => {
    if (!containerRef.current || !code) return;
    let cancelled = false;

    (async () => {
      try {
        const id = `mermaid-diagram-${++renderCounter}`;
        const { svg } = await mermaid.render(id, code);
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = svg;

        const svgEl = containerRef.current.querySelector("svg");
        if (!svgEl) return;
        svgEl.style.maxWidth = "100%";
        svgEl.style.height = "auto";

        // Collect all node IDs from the actual SVG
        const nodeEls = svgEl.querySelectorAll("g.node");
        const nodeIds: string[] = [];
        nodeEls.forEach((g) => {
          const nid = extractNodeId(g.id);
          nodeIds.push(nid);
        });
        nodeIdsRef.current = nodeIds;

        // Build adjacency from edge elements using their data-id attributes
        const adj = new Map<string, Set<string>>();
        nodeIds.forEach((nid) => adj.set(nid, new Set()));

        // Edge paths can be <g class="edgePath"> or direct <path> inside <g class="edgePaths">
        // Try both selectors
        let edgePathEls = svgEl.querySelectorAll("g.edgePath");
        if (edgePathEls.length === 0) {
          edgePathEls = svgEl.querySelectorAll("g.edgePaths > path, .edgePaths > path");
        }
        // Also try: paths with data-id starting with "L_"
        if (edgePathEls.length === 0) {
          edgePathEls = svgEl.querySelectorAll("path[data-id^='L_']");
        }

        edgePathEls.forEach((ep) => {
          const dataId = ep.getAttribute("data-id") || getEdgeDataId(ep);
          const pair = parseEdgeDataId(dataId, nodeIds);
          if (pair) {
            const [from, to] = pair;
            adj.get(from)?.add(to);
            adj.get(to)?.add(from);
          }
        });
        adjRef.current = adj;

        // Store edge pairs for hover effect
        const edgePairs: { el: Element; from: string; to: string }[] = [];
        edgePathEls.forEach((ep) => {
          const dataId = ep.getAttribute("data-id") || getEdgeDataId(ep);
          const pair = parseEdgeDataId(dataId, nodeIds);
          if (pair) edgePairs.push({ el: ep, from: pair[0], to: pair[1] });
        });
        edgePairsRef.current = edgePairs;

        // Edge labels
        const edgeLabelEls = svgEl.querySelectorAll("g.edgeLabel");
        const labelPairs: { el: Element; from: string; to: string }[] = [];
        edgeLabelEls.forEach((el) => {
          const labelChild = el.querySelector(".label");
          const dataId = labelChild?.getAttribute("data-id") || "";
          const pair = parseEdgeDataId(dataId, nodeIds);
          if (pair) labelPairs.push({ el, from: pair[0], to: pair[1] });
        });
        labelPairsRef.current = labelPairs;

        // Strip Mermaid's classDef !important CSS so we can override colors
        const styleEl = svgEl.querySelector("style");
        if (styleEl) {
          // Remove all classDef-generated rules (they target .youngFemale, .midMale, etc.)
          styleEl.textContent = (styleEl.textContent || "").replace(
            /#[^\s{]+\s+\.\w+\s+(rect|polygon|ellipse|circle|path)\s*\{[^}]*!important[^}]*\}/g,
            ""
          );
        }

        // Apply our global speaker colors to nodes
        nodeEls.forEach((g) => {
          const nid = extractNodeId(g.id);
          const displayName = nid.replace(/_/g, " ");
          const color = getSpeakerColor(displayName);
          const rect = g.querySelector("rect.basic, rect.label-container");
          if (rect) {
            (rect as HTMLElement).style.setProperty("fill", color.bg.replace("0.12", "0.3"), "important");
            (rect as HTMLElement).style.setProperty("stroke", color.border, "important");
            (rect as HTMLElement).style.setProperty("stroke-width", "2px");
          }
        });

        // Attach node listeners
        nodeEls.forEach((g) => {
          const nid = extractNodeId(g.id);
          (g as HTMLElement).style.cursor = "pointer";

          g.addEventListener("mouseenter", () => setHoveredNode(nid));
          g.addEventListener("mouseleave", () => setHoveredNode(null));
          g.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            onClickRef.current?.(nid);
          });

          // Also handle clicks on children (foreignObject / text inside the node)
          g.querySelectorAll("*").forEach((child) => {
            child.addEventListener("click", (e) => {
              e.preventDefault();
              e.stopPropagation();
              onClickRef.current?.(nid);
            });
          });
        });
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Render failed");
        }
      }
    })();

    return () => { cancelled = true; };
  }, [code]);

  // Hover effect — dim unrelated, highlight connected
  useEffect(() => {
    if (!containerRef.current) return;
    const svgEl = containerRef.current.querySelector("svg");
    if (!svgEl) return;

    const nodeEls = svgEl.querySelectorAll("g.node");
    const adj = adjRef.current;
    const edgePairs = edgePairsRef.current;
    const labelPairs = labelPairsRef.current;

    if (!hoveredNode) {
      // Reset everything
      nodeEls.forEach((n) => ((n as HTMLElement).style.opacity = "1"));
      edgePairs.forEach((e) => ((e.el as HTMLElement).style.opacity = "1"));
      labelPairs.forEach((e) => ((e.el as HTMLElement).style.opacity = "1"));
      return;
    }

    const connected = adj.get(hoveredNode) ?? new Set();

    // Dim everything
    nodeEls.forEach((n) => ((n as HTMLElement).style.opacity = "0.1"));
    edgePairs.forEach((e) => ((e.el as HTMLElement).style.opacity = "0.1"));
    labelPairs.forEach((e) => ((e.el as HTMLElement).style.opacity = "0.1"));

    // Highlight hovered + connected nodes
    nodeEls.forEach((g) => {
      const nid = extractNodeId(g.id);
      if (nid === hoveredNode || connected.has(nid)) {
        (g as HTMLElement).style.opacity = "1";
      }
    });

    // Highlight connected edges and labels
    edgePairs.forEach((e) => {
      if (e.from === hoveredNode || e.to === hoveredNode) {
        (e.el as HTMLElement).style.opacity = "1";
      }
    });
    labelPairs.forEach((e) => {
      if (e.from === hoveredNode || e.to === hoveredNode) {
        (e.el as HTMLElement).style.opacity = "1";
      }
    });
  }, [hoveredNode]);

  if (error) {
    return (
      <div className="space-y-2">
        <div className="rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 px-3 py-2 text-xs text-[var(--color-danger-text)]">
          Diagram render error: {error}
        </div>
        <pre className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-xs text-[var(--color-text-muted)]">
          {code}
        </pre>
      </div>
    );
  }

  return (
    <div>
      <div
        ref={containerRef}
        className="overflow-x-auto rounded-lg border border-[var(--color-border)] bg-white p-4"
      />
      <div className="h-6 flex items-center">
        {hoveredNode && (
          <span className="text-xs text-[var(--color-text-muted)]">
            Connections: <span className="font-medium text-[var(--color-text-secondary)]">{hoveredNode.replace(/_/g, " ")}</span>
          </span>
        )}
      </div>
    </div>
  );
}
