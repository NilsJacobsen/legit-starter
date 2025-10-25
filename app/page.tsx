"use client";

import { useEffect, useState } from "react";
import { Volume, createFsFromVolume } from "memfs";
import * as git from "isomorphic-git";
import { createLegitFs } from "../legit-sdk";

type User = {
  name: string;
  email: string;
  timestamp: number;
  timezoneOffset: number;
};

type HistoryItem = {
  oid: string;
  message: string;
  parent: string[];
  tree: string;
  author: User;
  committer: User;
};

export default function Home() {
  const [legitFs, setLegitFs] = useState<ReturnType<typeof createLegitFs> | null>(null);
  const [text, setText] = useState("Hello World");
  const [currentText, setCurrentText] = useState("Hello World");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [checkoutOid, setCheckoutOid] = useState<string | null>(null);

    // Get commit content by OID
  const getCommitContent = async (oid: string | null) => {
    if (!oid || !legitFs) return "";
    const path = `/.legit/commits/${oid.slice(0, 2)}/${oid.slice(2)}/document.txt`;
    try {
      const content = await legitFs.promises.readFile(path);
      return String(content);
    } catch {
      return "";
    }
  };

  // Initialize in-memory repo
  useEffect(() => {
    const initFs = async () => {
      const vol = new Volume();
      const fs = createFsFromVolume(vol);

      await git.init({ fs, dir: "/", defaultBranch: "main" });
      await fs.promises.writeFile("/document.txt", "Hello World");
      await git.add({ fs, dir: "/", filepath: "document.txt" });
      await git.commit({
        fs,
        dir: "/",
        message: "Initial commit",
        author: { name: "Test", email: "test@example.com" },
      });

      setLegitFs(createLegitFs(fs, "/"));
    };
    initFs();
  }, []);

  // Poll history every second
  useEffect(() => {
    if (!legitFs) return;
    const interval = setInterval(async () => {
      try {
        const raw = await legitFs.promises.readFile("/.legit/branches/main/.legit/history");
        const parsed: HistoryItem[] = JSON.parse(String(raw));
        setHistory(parsed);

        if (!checkoutOid && parsed.length > 0) {
          setCheckoutOid(parsed[0].oid);
          const content = await getCommitContent(parsed[0].oid);
          setCurrentText(content);
          setText(content);
        }
      } catch {
        setHistory([]);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [legitFs, checkoutOid]);

  // Checkout a commit
  const checkoutCommit = async (oid: string) => {
    if (!legitFs) return;

    setCheckoutOid(oid);
    const commit = history.find((h) => h.oid === oid);
    if (!commit) return;

    const parentOid = commit.parent[0] || null;
    const oldContent = await getCommitContent(parentOid);
    const newContent = await getCommitContent(oid);

    setCurrentText(newContent);

    // Allow editing only on latest commit
    if (oid === history[0]?.oid) setText(newContent);
  };

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
        {history.map((h) => (
          <button
            key={h.oid}
            onClick={() => checkoutCommit(h.oid)}
            className={`text-left px-2 py-1 border rounded ${
              checkoutOid === h.oid ? "bg-gray-300 dark:bg-zinc-700" : ""
            }`}
          >
            {h.message} - {new Date(h.author.timestamp * 1000).toLocaleString()}
          </button>
        ))}
      </div>
    </div>
  );
}
