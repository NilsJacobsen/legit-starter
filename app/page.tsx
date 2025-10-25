"use client";

import { useEffect, useState } from "react";
import { Volume, createFsFromVolume } from "memfs";
import * as git from "isomorphic-git";
import { createLegitFs } from "../legit-sdk";
import { DiffMatchPatch } from "diff-match-patch-ts"

type User = { name: string; email: string; timestamp: number };
type HistoryItem = { oid: string; message: string; parent: string[]; author: User; };

export default function Home() {
  const dmp = new DiffMatchPatch();
  const [legitFs, setLegitFs] = useState<ReturnType<typeof createLegitFs> | null>(null);
  const [text, setText] = useState("Hello World");
  const [currentText, setCurrentText] = useState("Hello World");
  const [history, setHistory] = useState<(HistoryItem & { oldContent: string; newContent: string })[]>([]);
  const [checkoutOid, setCheckoutOid] = useState<string | null>(null);

  // Initialize in-memory repo
  useEffect(() => {
    const initFs = async () => {
      const vol = new Volume();
      const fs = createFsFromVolume(vol);

      await git.init({ fs, dir: "/", defaultBranch: "main" });
      await fs.promises.writeFile("/document.txt", "Hello World");
      await git.add({ fs, dir: "/", filepath: "document.txt" });
      await git.commit({ fs, dir: "/", message: "Initial commit", author: { name: "Test", email: "test@example.com", timestamp: Date.now() } });

      setLegitFs(createLegitFs(fs, "/"));
    };
    initFs();
  }, []);

  // Get file content from a commit
  const getCommitContent = async (oid: string | null) => {
    if (!oid || !legitFs) return "";
    try {
      const path = `/.legit/commits/${oid.slice(0, 2)}/${oid.slice(2)}/document.txt`;
      const content = await legitFs.promises.readFile(path);
      return String(content);
    } catch {
      return "";
    }
  };

  // Poll history
  useEffect(() => {
    if (!legitFs) return;
    const interval = setInterval(async () => {
      try {
        const raw = await legitFs.promises.readFile("/.legit/branches/main/.legit/history");
        const parsed: HistoryItem[] = JSON.parse(String(raw));

        // Compute old/new preview for each commit
        const enriched = await Promise.all(parsed.map(async (h) => {
          const newContent = await getCommitContent(h.oid);
          const parentOid = h.parent[0] || null;
          const oldContent = await getCommitContent(parentOid);
          return { ...h, oldContent, newContent };
        }));

        setHistory(enriched);

        if (!checkoutOid && enriched.length > 0) {
          setCheckoutOid(enriched[0].oid);
          setCurrentText(enriched[0].newContent);
          setText(enriched[0].newContent);
        }
      } catch {
        setHistory([]);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [legitFs, checkoutOid]);

  // Checkout commit
  const checkoutCommit = (oid: string) => {
    const commit = history.find((h) => h.oid === oid);
    if (!commit) return;
    setCheckoutOid(oid);
    setCurrentText(commit.newContent);
    if (oid === history[0]?.oid) setText(commit.newContent); // allow editing only on latest
  };

  // Save latest commit
  const handleSave = async () => {
    if (!legitFs || checkoutOid !== history[0]?.oid) return;
    await legitFs.promises.writeFile("/.legit/branches/main/document.txt", text);
    setCurrentText(text);
    setCheckoutOid(null);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-8 gap-4 bg-zinc-50 dark:bg-black">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">LegitFS Client Editor</h1>

      <div className="flex gap-2">
        <textarea
          value={checkoutOid === history[0]?.oid ? text : currentText}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="border px-2 py-1 w-96"
          disabled={checkoutOid !== history[0]?.oid}
        />
        <button
          onClick={handleSave}
          disabled={checkoutOid !== history[0]?.oid}
          className="bg-blue-500 text-white px-4 py-1 rounded disabled:opacity-50"
        >
          Save
        </button>
      </div>

      <h2 className="mt-4 text-lg font-semibold text-black dark:text-zinc-50">History</h2>
      <div className="flex flex-col gap-2 max-w-xl w-full">
        {history.map((h) => {
          const diffs = dmp.diff_main(h.oldContent, h.newContent);
          dmp.diff_cleanupSemantic(diffs);
          const html = dmp.diff_prettyHtml(diffs);

          return <div key={h.oid} className="border rounded p-2">
            <button
              onClick={() => checkoutCommit(h.oid)}
              className={`text-left w-full px-2 py-1 ${checkoutOid === h.oid ? "bg-gray-300 dark:bg-zinc-700" : ""}`}
            >
              {h.message} - {new Date(h.author.timestamp).toLocaleString()}
            </button>

            <div
              className="text-sm text-gray-700 dark:text-gray-300 overflow-auto whitespace-pre-wrap"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          </div>
        })}
      </div>
    </div>
  );
}

