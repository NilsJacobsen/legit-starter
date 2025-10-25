/* eslint-disable @typescript-eslint/ban-ts-comment */
"use client";

import { useEffect, useState } from "react";
import { Volume, createFsFromVolume } from "memfs";
import * as git from "isomorphic-git";
import { createLegitFs } from "../legit-sdk";

export default function Home() {
  const [legitFs, setLegitFs] = useState<ReturnType<typeof createLegitFs> | null>(null);
  const [text, setText] = useState("Hello World");

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

      const versionedFs = createLegitFs(fs, "/");
      setLegitFs(versionedFs);
    };

    initFs();
  }, []);

  const handleSave = async () => {
    try {
       // @ts-expect-error
      await legitFs?.promises.writeFile("/.legit/branches/main/document.txt", text);
      alert("Saved!");
    } catch (error) {
      console.error(error);
    }
  };

  const logMainState = async () => {
    if (!legitFs) return;
    // @ts-expect-error
    const content = await legitFs?.promises.readFile("/.legit/branches/main/document.txt");
    console.log("Main branch content:", String(content));
  };

  const logCommitsState = async () => {
    if (!legitFs) return;
    // @ts-expect-error
    const commits = await legitFs?.promises.readdir("/.legit/commits");
    console.log("Commits:", commits);
  };

  const logHistoryState = async () => {
    if (!legitFs) return;
    // @ts-expect-error
    const history = await legitFs?.promises.readFile("/.legit/branches/main/.legit/history");
    console.log("History:", String(history));
  };

return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-zinc-50 font-sans dark:bg-black p-8 gap-4">
      <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">Client-side LegitFS Starter</h1>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="border px-2 py-1"
        />
        <button onClick={handleSave} className="bg-blue-500 text-white px-4 py-1 rounded">
          Save
        </button>
      </div>
      <div className="flex gap-2">
        <button onClick={logMainState} className="bg-green-500 text-white px-4 py-1 rounded">
          Log main state
        </button>
        <button onClick={logCommitsState} className="bg-yellow-500 text-white px-4 py-1 rounded">
          Log commit state
        </button>
        <button onClick={logHistoryState} className="bg-purple-500 text-white px-4 py-1 rounded">
          Log history state
        </button>
      </div>
    </div>
  );
}
