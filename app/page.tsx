"use client";

import { useEffect, useState, useRef } from "react";
import fs from "memfs";
import { initLegitFs, HistoryItem } from "@legit-sdk/core";
import { DiffMatchPatch } from "diff-match-patch-ts";
import Image from "next/image";
import { format } from "timeago.js";
import Link from "next/link";

const INITIAL_TEXT = "This is a document that you can edit! 🖋️";
const FILE_NAME = "document.txt";

export default function Home() {
  const dmp = new DiffMatchPatch();
  const [legitFs, setLegitFs] = useState<Awaited<ReturnType<typeof initLegitFs>> | null>(null);
  const [text, setText] = useState(INITIAL_TEXT);
  const [history, setHistory] = useState<(HistoryItem & { oldContent: string; newContent: string })[]>([]);
  const [checkoutOid, setCheckoutOid] = useState<string | null>(null);
  const headRef = useRef<string | null>(null);

  // Get file content from a commit
  const getCommitContent = async (oid: string | null) => {
    if (!oid || !legitFs) return "";
    try {
      return await legitFs.promises.readFile(`/.legit/commits/${oid.slice(0, 2)}/${oid.slice(2)}/${FILE_NAME}`, "utf8") as string;
    } catch {
      return ""
    }
  };

  // Checkout a commit
  const checkoutCommit = async (oid: string) => {
    setText(await getCommitContent(oid));
    setCheckoutOid(oid);
  };

  // Save latest commit (only allowed on HEAD)
  const handleSave = async () => {
    if (!legitFs || checkoutOid !== history[0]?.oid) return;
    await legitFs.promises.writeFile(`/.legit/branches/main/${FILE_NAME}`, text);

    // Get the new HEAD OID after the commit happens
    const newHead = await legitFs.promises.readFile(
      "/.legit/branches/main/.legit/head",
      "utf8"
    ) as string;
    setCheckoutOid(newHead);
  };

  // Initialize in-memory repo & and put a document.txt in it
  useEffect(() => {
    const initFs = async () => {
      try {
        if (!legitFs) {
          const _legitFs = await initLegitFs(fs as unknown as typeof import("node:fs"), "/");
          await _legitFs.promises.writeFile(`/.legit/branches/main/${FILE_NAME}`, INITIAL_TEXT);
          setLegitFs(_legitFs);
        }
      } catch (err) {
        console.error("Failed to initialize LegitFS:", err);
      }
    };
    initFs();
  }, []);

  // Poll for HEAD changes only
  useEffect(() => {
    if (!legitFs) return;

    const pollHead = setInterval(async () => {
      try {
        const newHead = await legitFs.promises.readFile(
          "/.legit/branches/main/.legit/head",
          "utf8"
        ) as string;

        if (newHead && newHead !== headRef.current) {
          headRef.current = newHead;
          setCheckoutOid(newHead);
        }
      } catch (e) {
        console.error("Polling the head failed: ", e)
      }
      // polling with 50ms is fine because reading the head is really cheap
    }, 200);

    return () => clearInterval(pollHead);
  }, [legitFs]);

  // Fetch and enrich history when HEAD changes
  useEffect(() => {
    if (!legitFs || !checkoutOid) return;

    const updateHistory = async () => {
      try {
        const raw = await legitFs.promises.readFile(
          "/.legit/branches/main/.legit/history",
          "utf8"
        ) as string;
        if (!raw) return;

        const parsed: HistoryItem[] = JSON.parse(raw);
        console.log(parsed)
        const enriched = await Promise.all(
          parsed.map(async (h) => {
            const newContent = await getCommitContent(h.oid)
            const oldContent = await getCommitContent(h.parent[0])
            return { ...h, oldContent, newContent };
          })
        );

        setHistory(enriched);

        // Update editor if we're on HEAD
        const latest = enriched.find((h) => h.oid === checkoutOid);
        if (latest) setText(latest.newContent);
      } catch (e) {
        console.error("Not able to update history state: ", e)
      }
    };

    updateHistory();
  }, [legitFs, checkoutOid]);

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
      <Link href="https://legitcontrol.com">
        <Image alt="Legit Logo" src="/logo.svg" width={70} height={40} />
      </Link>

      <h1 className="text-2xl font-semibold mt-8">Legit SDK Starter</h1>
      <p className="max-w-lg mb-8">
        This is just a small sample of what the Legit SDK can do. The goal is to make some features tangible. More functionality and examples will follow soon.
      </p>

      {/* Editor */}
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

      {/* History */}
      <h2 className="mt-2 text-md font-semibold">History</h2>
      <div className="flex flex-col gap-2 max-w-lg w-full">
        {history.map((h) => (
          <div
            key={h.oid}
            className={`hover:bg-zinc-50 rounded-lg p-4 cursor-pointer ${
              checkoutOid === h.oid ? "bg-zinc-100 hover:bg-zinc-100" : ""
            }`}
            onClick={() => checkoutCommit(h.oid)}
          >
            <div className="flex gap-3 items-center">
              <Image alt="Avatar" src="/avatar.svg" width={32} height={32} />
              <p className="text-md font-semibold flex-1">{h.message}</p>
              {h.oid === history[0]?.oid && <p className="px-1.5 py-1 bg-zinc-200 text-sm rounded text-zinc-600" >latest</p>}
              <p className="text-sm">{format(h.author.timestamp * 1000)}</p>
            </div>
            <div className="mt-2">{renderDiff(h.oldContent, h.newContent)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
