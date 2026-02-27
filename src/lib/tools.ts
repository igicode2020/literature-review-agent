import { parseStringPromise } from "xml2js";

export interface Paper {
  id: string;
  title: string;
  authors: string[];
  year: number | null;
  abstract: string;
  url: string;
  citationCount?: number;
  source: "semantic_scholar" | "arxiv";
}

/**
 * Search Semantic Scholar for academic papers.
 */
export async function searchSemanticScholar(
  query: string,
  limit: number = 5
): Promise<Paper[]> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(
    query
  )}&limit=${limit}&fields=title,authors,year,abstract,url,citationCount`;

  const response = await fetch(url, {
    headers: { "User-Agent": "LiteratureReviewAgent/1.0" },
  });

  if (!response.ok) {
    throw new Error(`Semantic Scholar API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  return (data.data || [])
    .filter((paper: Record<string, unknown>) => paper.title)
    .map((paper: Record<string, unknown>) => ({
      id: paper.paperId as string,
      title: paper.title as string,
      authors: ((paper.authors as Array<{ name: string }>) || []).map(
        (a) => a.name
      ),
      year: paper.year as number | null,
      abstract: (paper.abstract as string) || "",
      url:
        (paper.url as string) ||
        `https://www.semanticscholar.org/paper/${paper.paperId}`,
      citationCount: paper.citationCount as number | undefined,
      source: "semantic_scholar" as const,
    }));
}

/**
 * Search arXiv for preprints and papers.
 */
export async function searchArxiv(
  query: string,
  limit: number = 5
): Promise<Paper[]> {
  const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(
    query
  )}&start=0&max_results=${limit}&sortBy=relevance`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`arXiv API error: ${response.status} ${response.statusText}`);
  }

  const xmlText = await response.text();
  const parsed = await parseStringPromise(xmlText);

  const entries = parsed.feed?.entry || [];

  if (!Array.isArray(entries)) {
    return [];
  }

  return entries.map((entry: Record<string, unknown[]>) => {
    const id = ((entry.id as string[])?.[0] || "").trim();
    const arxivId = id.replace("http://arxiv.org/abs/", "").replace("https://arxiv.org/abs/", "");

    return {
      id: arxivId,
      title: ((entry.title as string[])?.[0] || "")
        .replace(/\s+/g, " ")
        .trim(),
      authors: ((entry.author as Array<{ name: string[] }>) || []).map(
        (a) => a.name?.[0] || ""
      ),
      year: (entry.published as string[])?.[0]
        ? new Date((entry.published as string[])[0]).getFullYear()
        : null,
      abstract: ((entry.summary as string[])?.[0] || "")
        .replace(/\s+/g, " ")
        .trim(),
      url: id,
      source: "arxiv" as const,
    };
  });
}

/**
 * Get detailed information about a specific paper.
 */
export async function getPaperDetails(
  paperId: string,
  source: string
): Promise<Paper | null> {
  try {
    if (source === "semantic_scholar") {
      const url = `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(
        paperId
      )}?fields=title,authors,year,abstract,url,citationCount`;
      const response = await fetch(url, {
        headers: { "User-Agent": "LiteratureReviewAgent/1.0" },
      });
      if (!response.ok) return null;
      const paper = await response.json();
      return {
        id: paper.paperId,
        title: paper.title,
        authors: (paper.authors || []).map(
          (a: { name: string }) => a.name
        ),
        year: paper.year,
        abstract: paper.abstract || "",
        url:
          paper.url ||
          `https://www.semanticscholar.org/paper/${paper.paperId}`,
        citationCount: paper.citationCount,
        source: "semantic_scholar",
      };
    } else if (source === "arxiv") {
      const url = `https://export.arxiv.org/api/query?id_list=${encodeURIComponent(paperId)}`;
      const response = await fetch(url);
      if (!response.ok) return null;
      const xmlText = await response.text();
      const parsed = await parseStringPromise(xmlText);
      const entry = parsed.feed?.entry?.[0];
      if (!entry) return null;

      return {
        id: paperId,
        title: (entry.title?.[0] || "").replace(/\s+/g, " ").trim(),
        authors: (entry.author || []).map(
          (a: { name: string[] }) => a.name?.[0] || ""
        ),
        year: entry.published?.[0]
          ? new Date(entry.published[0]).getFullYear()
          : null,
        abstract: (entry.summary?.[0] || "").replace(/\s+/g, " ").trim(),
        url: entry.id?.[0] || "",
        source: "arxiv",
      };
    }
  } catch {
    return null;
  }

  return null;
}

/**
 * Delay utility for rate limiting between API calls.
 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
