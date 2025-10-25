/* eslint-disable @typescript-eslint/ban-ts-comment */
"use client";

import { useEffect, useState } from "react";
import { Volume, createFsFromVolume } from "memfs";
import * as git from "isomorphic-git";
import { createLegitFs } from "../legit-sdk";
import { DiffMatchPatch } from "diff-match-patch-ts";
import Image from "next/image";
import { format } from "timeago.js";
import Link from "next/link";

const INITIAL_TEXT = 'This is a document that you can edit! 🖋️';
const FILE_NAME = 'document.txt';

type User = { name: string; email: string; timestamp: number };
type HistoryItem = { oid: string; message: string; parent: string[]; author: User };

export default function Home() {
  const dmp = new DiffMatchPatch();
  const [legitFs, setLegitFs] = useState<ReturnType<typeof createLegitFs> | null>(null);
  const [text, setText] = useState(INITIAL_TEXT);
  const [history, setHistory] = useState<(HistoryItem & { oldContent: string; newContent: string })[]>([]);
  const [checkoutOid, setCheckoutOid] = useState<string | null>(null);

  // Initialize in-memory repo
  useEffect(() => {
    const initFs = async () => {
      const vol = new Volume();
      const fs = createFsFromVolume(vol);

      await git.init({ fs, dir: "/", defaultBranch: "main" });
      await fs.promises.writeFile("/" + FILE_NAME, INITIAL_TEXT);
      await git.add({ fs, dir: "/", filepath: FILE_NAME });
      await git.commit({
        fs,
        dir: "/",
        message: "Initial commit",
        author: { name: "Test", email: "test@example.com", timestamp: Date.now() },
      });

      setLegitFs(createLegitFs(fs, "/"));
    };
    initFs();
  }, []);

  // Get file content from a commit
  const getCommitContent = async (oid: string | null) => {
    if (!oid || !legitFs) return "";
    try {
      const path = `/.legit/commits/${oid.slice(0, 2)}/${oid.slice(2)}/${FILE_NAME}`;
      // @ts-expect-error
      const content = await legitFs.promises.readFile(path);
      return String(content);
    } catch {
      return "";
    }
  };

  // Poll history + enrich with before/after content
  useEffect(() => {
    if (!legitFs) return;
    const interval = setInterval(async () => {
      try {
        // @ts-expect-error
        const raw = await legitFs.promises.readFile("/.legit/branches/main/.legit/history");
        const parsed: HistoryItem[] = JSON.parse(String(raw));

        const enriched = await Promise.all(
          parsed.map(async (h) => {
            const newContent = await getCommitContent(h.oid);
            const parentOid = h.parent[0] || null;
            const oldContent = await getCommitContent(parentOid);
            return { ...h, oldContent, newContent };
          })
        );

        setHistory(enriched);

        // Initialize editor with latest commit
        if (!checkoutOid && enriched.length > 0) {
          setCheckoutOid(enriched[0].oid);
          setText(enriched[0].newContent);
        }
      } catch {
        setHistory([]);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [legitFs, checkoutOid]);

  // Checkout a commit
  const checkoutCommit = (oid: string) => {
    const commit = history.find((h) => h.oid === oid);
    if (!commit) return;
    setCheckoutOid(oid);
    setText(commit.newContent);
  };

  // Save latest commit (only allowed on HEAD)
  const handleSave = async () => {
    if (!legitFs || checkoutOid !== history[0]?.oid) return;
    // @ts-expect-error
    await legitFs.promises.writeFile(`/.legit/branches/main/${FILE_NAME}`, text);
    setCheckoutOid(null)
  };

  // Render diff helper
  const renderDiff = (oldStr: string, newStr: string) => {
    const diff = dmp.diff_main(oldStr, newStr);
    dmp.diff_cleanupSemantic(diff);
    return (
      <div
        className="prose text-sm text-gray-700"
        dangerouslySetInnerHTML={{ __html: dmp.diff_prettyHtml(diff) }}
      />
    );
  };

  return (
    <div className="flex min-h-screen max-w-xl mx-auto flex-col p-8 gap-4">
      <Link href="legitcontrol.com" >
        <Image alt="Legit Logo" src="/logo.svg" width={70} height={40} />
      </Link>
      <h1 className="text-2xl font-semibold mt-8">Legit SDK Starter</h1>
      <p className="max-w-lg mb-8">This is just a small sample of what the Legit SDK can do. The goal is to make some features tangible. More functionality and examples will follow soon.</p>

      <div className="flex flex-col w-full border border-zinc-300 rounded-lg overflow-hidden">
        <div className="flex justify-between bg-zinc-100 px-3 py-2 border-b border-zinc-300">
          <div className="flex gap-2 items-center">
            <Image alt="File" src="/file.svg" width={20} height={20} />
            {FILE_NAME}
          </div>
          <button
            onClick={handleSave}
            disabled={checkoutOid !== history[0]?.oid}
            className="bg-[#FF611A] text-white px-3 py-1 rounded-lg font-semibold hover:opacity-80 cursor-pointer disabled:opacity-50"
          >
            Save
          </button>
        </div>
        
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={5}
          className="p-3 w-full bg-white"
          disabled={checkoutOid !== history[0]?.oid}
        />
      </div>

      <h2 className="mt-2 text-md font-semibold">History</h2>
      <div className="flex flex-col gap-2 max-w-lg w-full">
        {history.map((h) => (
          <div 
            key={h.oid} 
            className={`hover:bg-zinc-50 rounded-lg p-4 cursor-pointer ${checkoutOid === h.oid ? "bg-zinc-100 hover:bg-zinc-100" : ""}`} 
            onClick={() => checkoutCommit(h.oid)}
          >
            <div className="flex gap-3 items-center">
              <Image alt="Avatar" src="/avatar.svg" width={32} height={32} />
              <p className="text-md font-semibold flex-1" >
                {h.message}
              </p>
              {/* TODO: fix format */}
              {format(String(h.author.timestamp).length < 13 ? h.author.timestamp * 1000 : h.author.timestamp)}
            </div>
            <div className="mt-2">{renderDiff(h.oldContent, h.newContent)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
