import Anthropic from "@anthropic-ai/sdk";
import {
  searchSemanticScholar,
  searchArxiv,
  getPaperDetails,
  delay,
} from "./tools";
import type { Paper } from "./tools";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface AgentEvent {
  type:
    | "status"
    | "paper_found"
    | "thinking"
    | "review_start"
    | "review_chunk"
    | "complete"
    | "error"
    | "papers_count";
  data: string | number | Record<string, unknown>;
}

export type EventCallback = (event: AgentEvent) => void;

/* ------------------------------------------------------------------ */
/*  Tool definitions for Claude                                        */
/* ------------------------------------------------------------------ */

const tools: Anthropic.Messages.Tool[] = [
  {
    name: "search_semantic_scholar",
    description:
      "Search for academic papers on Semantic Scholar. Returns papers with titles, authors, years, abstracts, and citation counts. Use varied query phrasings to get diverse results.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description: "The search query for finding papers",
        },
        limit: {
          type: "number" as const,
          description:
            "Maximum number of results to return (default: 10, max: 20)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "search_arxiv",
    description:
      "Search for papers on the arXiv preprint server. Good for finding recent research and preprints. Returns papers with titles, authors, years, and abstracts.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string" as const,
          description: "The search query for finding papers",
        },
        limit: {
          type: "number" as const,
          description:
            "Maximum number of results to return (default: 10, max: 20)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "get_paper_details",
    description:
      "Get detailed information about a specific paper including its full abstract and metadata.",
    input_schema: {
      type: "object" as const,
      properties: {
        paper_id: {
          type: "string" as const,
          description: "The unique identifier of the paper",
        },
        source: {
          type: "string" as const,
          enum: ["semantic_scholar", "arxiv"],
          description: "Which database the paper is from",
        },
      },
      required: ["paper_id", "source"],
    },
  },
  {
    name: "extract_findings",
    description:
      "Analyze a paper's abstract/text to extract and structure its key findings, methodology, and conclusions. Use this for papers that seem particularly important.",
    input_schema: {
      type: "object" as const,
      properties: {
        paper_title: {
          type: "string" as const,
          description: "The title of the paper",
        },
        paper_text: {
          type: "string" as const,
          description: "The abstract or text of the paper to analyze",
        },
      },
      required: ["paper_title", "paper_text"],
    },
  },
];

/* ------------------------------------------------------------------ */
/*  System prompts                                                     */
/* ------------------------------------------------------------------ */

const SEARCH_SYSTEM_PROMPT = `You are an expert academic research assistant tasked with conducting a thorough literature review. Your job in this phase is to SEARCH for and COLLECT relevant papers.

Instructions:
1. Use the search tools to find relevant papers. Use 1-2 search queries to find good results.
2. Search Semantic Scholar OR arXiv (pick whichever is more appropriate, no need to use both).
3. Aim to collect up to 5 relevant, high-quality papers. Stop as soon as you have 5.
4. Use get_paper_details if you need more information about a specific paper.
5. Use extract_findings to deeply analyze the most important papers.
6. After gathering enough papers (up to 5), respond with exactly the text "SYNTHESIS_READY" (no tool calls).

Strategy:
- Use a focused query to find the most relevant papers quickly
- Look for papers with differing viewpoints for a balanced review
- Stop searching once you have up to 5 good papers

When you have gathered enough papers, respond with just "SYNTHESIS_READY" and nothing else.`;

const REVIEW_SYSTEM_PROMPT = `You are an expert academic researcher writing a structured literature review. Write a comprehensive, well-organized review based on the provided papers.

Your review MUST follow this EXACT structure with these markdown headings:

## Executive Summary
Write 3-5 sentences summarizing the overall state of research on this topic.

## Key Themes
Group and discuss findings across papers by theme. Use ### subheadings for each theme. Cite papers using [Author et al., Year] format.

## Contradictions & Debates
Identify and discuss areas where papers disagree or present conflicting evidence. Be specific about which papers disagree and on what points.

## Research Gaps
Identify what has NOT been adequately studied, based on what the collected papers reveal about limitations and future directions.

## Conclusion
Synthesize the overall state of knowledge and suggest the most promising future research directions.

## References
List all cited papers in this format:
- Author1, Author2, et al. (Year). "Title." URL

Guidelines:
- Be scholarly and analytical, not just descriptive
- Draw connections between papers
- Use specific evidence and findings from the papers
- Be balanced and objective
- When papers contradict each other, present both sides fairly
- Write in clear, academic prose
- Every paper you cite must appear in the References section with its URL`;

/* ------------------------------------------------------------------ */
/*  Tool execution                                                     */
/* ------------------------------------------------------------------ */

async function executeTool(
  name: string,
  input: Record<string, unknown>,
  collectedPapers: Map<string, Paper>,
  onEvent: EventCallback
): Promise<string> {
  switch (name) {
    case "search_semantic_scholar": {
      const query = input.query as string;
      const limit = Math.min((input.limit as number) || 10, 20);
      onEvent({
        type: "status",
        data: `Searching Semantic Scholar for "${query}"...`,
      });
      await delay(800);
      const papers = await searchSemanticScholar(query, limit);
      for (const paper of papers) {
        if (
          paper.title &&
          !collectedPapers.has(paper.title.toLowerCase().trim())
        ) {
          collectedPapers.set(paper.title.toLowerCase().trim(), paper);
          onEvent({
            type: "paper_found",
            data: {
              title: paper.title,
              authors: paper.authors.slice(0, 3),
              year: paper.year,
              source: "Semantic Scholar",
            },
          });
        }
      }
      onEvent({ type: "papers_count", data: collectedPapers.size });
      return JSON.stringify(
        papers.map((p) => ({
          id: p.id,
          title: p.title,
          authors: p.authors.slice(0, 3).join(", "),
          year: p.year,
          abstract: p.abstract?.substring(0, 500) || "No abstract available",
          citationCount: p.citationCount,
          source: p.source,
        }))
      );
    }

    case "search_arxiv": {
      const query = input.query as string;
      const limit = Math.min((input.limit as number) || 10, 20);
      onEvent({
        type: "status",
        data: `Searching arXiv for "${query}"...`,
      });
      await delay(800);
      const papers = await searchArxiv(query, limit);
      for (const paper of papers) {
        if (
          paper.title &&
          !collectedPapers.has(paper.title.toLowerCase().trim())
        ) {
          collectedPapers.set(paper.title.toLowerCase().trim(), paper);
          onEvent({
            type: "paper_found",
            data: {
              title: paper.title,
              authors: paper.authors.slice(0, 3),
              year: paper.year,
              source: "arXiv",
            },
          });
        }
      }
      onEvent({ type: "papers_count", data: collectedPapers.size });
      return JSON.stringify(
        papers.map((p) => ({
          id: p.id,
          title: p.title,
          authors: p.authors.slice(0, 3).join(", "),
          year: p.year,
          abstract: p.abstract?.substring(0, 500) || "No abstract available",
          source: p.source,
        }))
      );
    }

    case "get_paper_details": {
      const paperId = input.paper_id as string;
      const source = input.source as string;
      onEvent({
        type: "status",
        data: `Fetching details for paper...`,
      });
      await delay(500);
      const paper = await getPaperDetails(paperId, source);
      if (paper) {
        if (!collectedPapers.has(paper.title.toLowerCase().trim())) {
          collectedPapers.set(paper.title.toLowerCase().trim(), paper);
          onEvent({
            type: "paper_found",
            data: {
              title: paper.title,
              authors: paper.authors.slice(0, 3),
              year: paper.year,
              source,
            },
          });
          onEvent({ type: "papers_count", data: collectedPapers.size });
        }
        return JSON.stringify({
          id: paper.id,
          title: paper.title,
          authors: paper.authors.join(", "),
          year: paper.year,
          abstract: paper.abstract,
          url: paper.url,
          citationCount: paper.citationCount,
        });
      }
      return "Paper not found or API error occurred.";
    }

    case "extract_findings": {
      const paperTitle = input.paper_title as string;
      const paperText = input.paper_text as string;
      onEvent({
        type: "status",
        data: `Extracting findings from "${paperTitle.substring(0, 60)}..."`,
      });
      return JSON.stringify({
        paper_title: paperTitle,
        text_analyzed: paperText,
        instruction:
          "Use the above text to identify key findings, methodology, and conclusions for the literature review.",
      });
    }

    default:
      return `Unknown tool: ${name}`;
  }
}

/* ------------------------------------------------------------------ */
/*  Main agent loop                                                    */
/* ------------------------------------------------------------------ */

export async function runAgent(
  topic: string,
  onEvent: EventCallback,
  signal?: AbortSignal
): Promise<void> {
  const client = new Anthropic();
  const collectedPapers = new Map<string, Paper>();

  onEvent({
    type: "status",
    data: `Starting literature review on: "${topic}"`,
  });

  /* ---- Phase 1: Search & Collect ---- */

  const messages: Anthropic.Messages.MessageParam[] = [
    {
      role: "user",
      content: `Please conduct a literature review on the following research topic: "${topic}"\n\nSearch for relevant papers. Aim for up to 5 high-quality papers, then stop searching.`,
    },
  ];

  let iterations = 0;
  const maxIterations = 8;

  while (iterations < maxIterations) {
    if (signal?.aborted) {
      onEvent({ type: "error", data: "Review cancelled by user" });
      return;
    }

    iterations++;
    onEvent({
      type: "status",
      data: `Agent reasoning... (step ${iterations})`,
    });

    let response: Anthropic.Messages.Message;
    try {
      response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: SEARCH_SYSTEM_PROMPT,
        tools,
        messages,
      });
    } catch (error) {
      onEvent({
        type: "error",
        data: `API error: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
      return;
    }

    // Separate tool use blocks from text blocks
    const toolUseBlocks = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use"
    );
    const textBlocks = response.content.filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === "text"
    );

    // Emit agent thinking text
    for (const block of textBlocks) {
      if (block.text.trim()) {
        onEvent({ type: "thinking", data: block.text.trim() });
      }
    }

    const textContent = textBlocks.map((b) => b.text).join("\n");

    // Check if the agent is done with the search phase
    if (
      textContent.includes("SYNTHESIS_READY") ||
      (toolUseBlocks.length === 0 && iterations >= 3) ||
      (response.stop_reason === "end_turn" && toolUseBlocks.length === 0)
    ) {
      onEvent({
        type: "status",
        data: `Search phase complete. Collected ${collectedPapers.size} papers.`,
      });
      break;
    }

    // If no tool calls and not enough iterations, nudge the agent
    if (toolUseBlocks.length === 0) {
      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content:
          'Respond with "SYNTHESIS_READY" if you have enough papers (aim for up to 5).',
      });
      continue;
    }

    // Add assistant response to conversation
    messages.push({ role: "assistant", content: response.content });

    // Execute all tool calls and collect results
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];

    for (const toolBlock of toolUseBlocks) {
      if (signal?.aborted) {
        onEvent({ type: "error", data: "Review cancelled by user" });
        return;
      }

      let result: string;
      try {
        result = await executeTool(
          toolBlock.name,
          toolBlock.input as Record<string, unknown>,
          collectedPapers,
          onEvent
        );
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        onEvent({
          type: "status",
          data: `Warning: ${toolBlock.name} failed — ${errorMsg}. Continuing...`,
        });
        result = `Error: ${errorMsg}. Please continue with other searches.`;
      }

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolBlock.id,
        content: result,
      });
    }

    messages.push({ role: "user", content: toolResults });
  }

  /* ---- Phase 2: Generate the structured review ---- */

  if (collectedPapers.size === 0) {
    onEvent({
      type: "error",
      data: "No papers were found. Please try a different or broader topic.",
    });
    return;
  }

  onEvent({ type: "review_start", data: "" });
  onEvent({
    type: "status",
    data: `Writing literature review from ${collectedPapers.size} papers...`,
  });

  const papersForReview = Array.from(collectedPapers.values());
  const papersContext = papersForReview
    .map(
      (p, i) =>
        `[${i + 1}] "${p.title}" by ${p.authors.slice(0, 5).join(", ")}${
          p.authors.length > 5 ? " et al." : ""
        } (${p.year || "n.d."})\nAbstract: ${
          p.abstract || "No abstract available"
        }\nURL: ${p.url}${
          p.citationCount !== undefined
            ? `\nCitations: ${p.citationCount}`
            : ""
        }`
    )
    .join("\n\n---\n\n");

  try {
    const stream = client.messages.stream({
      model: "claude-sonnet-4-6",
      max_tokens: 8192,
      system: REVIEW_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Write a comprehensive structured literature review on the topic: "${topic}"\n\nBased on the following ${papersForReview.length} papers:\n\n${papersContext}`,
        },
      ],
    });

    for await (const event of stream) {
      if (signal?.aborted) {
        onEvent({ type: "error", data: "Review cancelled by user" });
        stream.abort();
        return;
      }
      if (event.type === "content_block_delta") {
        const delta = event.delta;
        if ("text" in delta) {
          onEvent({ type: "review_chunk", data: delta.text });
        }
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      onEvent({ type: "error", data: "Review cancelled by user" });
      return;
    }
    onEvent({
      type: "error",
      data: `Review generation error: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    });
    return;
  }

  onEvent({
    type: "complete",
    data: { paperCount: collectedPapers.size },
  });
}
