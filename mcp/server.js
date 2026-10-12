#!/usr/bin/env node

/**
 * Model Context Protocol (MCP) Stdio Server for Zen Browser Website Styling (my-internet)
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import readline from "readline";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const websitesDir = path.join(repoRoot, "websites");
const userContentPath = "/home/akssh/.config/zen/f7ngu58s.Default (release)/chrome/userContent.css";

function run(cmd) {
  return execSync(cmd, { cwd: repoRoot, encoding: "utf-8" }).trim();
}

const TOOLS = [
  {
    name: "zen_style_status",
    description: "Get the current repository status, current commit hash, and count of styled websites.",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "zen_style_inspect",
    description: "Inspect the CSS and extracted features for a specific website domain (e.g. chatgpt.com, youtube.com).",
    inputSchema: {
      type: "object",
      properties: {
        domain: {
          type: "string",
          description: "Domain name to inspect, e.g. 'chatgpt.com' or 'music.youtube.com'"
        }
      },
      required: ["domain"]
    }
  },
  {
    name: "zen_style_build",
    description: "Compile websites/*.css into styles.json and sync userContent.css for Zen Browser.",
    inputSchema: {
      type: "object",
      properties: {},
      required: []
    }
  },
  {
    name: "zen_style_deploy",
    description: "Build styles.json, sync userContent.css, commit changes, push to GitHub, and return the exact commit SHA and raw fetch URLs.",
    inputSchema: {
      type: "object",
      properties: {
        message: {
          type: "string",
          description: "Git commit message describing the style change"
        }
      },
      required: ["message"]
    }
  }
];

function handleToolCall(name, args) {
  if (name === "zen_style_status") {
    const commitSha = run("git rev-parse --short HEAD");
    const gitStatus = run("git status -s");
    const cssCount = fs.readdirSync(websitesDir).filter(f => f.endsWith(".css")).length;
    return {
      repo: repoRoot,
      head: commitSha,
      styled_websites: cssCount,
      working_tree: gitStatus || "Clean"
    };
  }

  if (name === "zen_style_inspect") {
    const domain = args.domain.endsWith(".css") ? args.domain : `${args.domain}.css`;
    const filePath = path.join(websitesDir, domain);
    if (!fs.existsSync(filePath)) {
      return { error: `File not found: ${domain}` };
    }
    const content = fs.readFileSync(filePath, "utf-8");
    const features = (content.match(/\/\* [^$]+ \$ [^*]+ \*\//g) || []);
    return {
      domain,
      feature_count: features.length,
      features,
      preview: content.slice(0, 1500)
    };
  }

  if (name === "zen_style_build") {
    run("node update-styles-json.mjs");
    const chatgptCss = path.join(websitesDir, "chatgpt.com.css");
    let userContentSynced = false;
    if (fs.existsSync(chatgptCss)) {
      const css = fs.readFileSync(chatgptCss, "utf-8");
      const content = `/* Zen Browser userContent.css */\n@-moz-document domain("chatgpt.com"), domain("chat.openai.com") {\n${css}\n}\n`;
      try {
        fs.writeFileSync(userContentPath, content);
        userContentSynced = true;
      } catch (e) {}
    }
    return { success: true, userContentSynced };
  }

  if (name === "zen_style_deploy") {
    // 1. Build
    run("node update-styles-json.mjs");
    const chatgptCss = path.join(websitesDir, "chatgpt.com.css");
    if (fs.existsSync(chatgptCss)) {
      const css = fs.readFileSync(chatgptCss, "utf-8");
      const content = `/* Zen Browser userContent.css */\n@-moz-document domain("chatgpt.com"), domain("chat.openai.com") {\n${css}\n}\n`;
      try { fs.writeFileSync(userContentPath, content); } catch (e) {}
    }

    // 2. Commit & Push
    run("git add -A");
    const status = run("git status --porcelain");
    if (status) {
      const msg = args.message || "style: update website styles";
      run(`git commit -m "${msg.replace(/"/g, '\\"')}"`);
      run("git push origin-user main");
    }

    const commitSha = run("git rev-parse --short HEAD");
    return {
      success: true,
      commit: commitSha,
      extension_fetch_url: `https://raw.githubusercontent.com/aksshcode/my-internet/${commitSha}/styles.json`,
      main_branch_url: `https://raw.githubusercontent.com/aksshcode/my-internet/main/styles.json`
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

rl.on("line", (line) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line);
    const { id, method, params } = req;

    if (method === "initialize") {
      const res = {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "zen-styler-mcp", version: "1.0.0" }
        }
      };
      process.stdout.write(JSON.stringify(res) + "\n");
      return;
    }

    if (method === "tools/list") {
      const res = {
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS }
      };
      process.stdout.write(JSON.stringify(res) + "\n");
      return;
    }

    if (method === "tools/call") {
      const { name, arguments: toolArgs } = params;
      try {
        const out = handleToolCall(name, toolArgs || {});
        const res = {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: JSON.stringify(out, null, 2) }]
          }
        };
        process.stdout.write(JSON.stringify(res) + "\n");
      } catch (err) {
        const res = {
          jsonrpc: "2.0",
          id,
          result: {
            content: [{ type: "text", text: `Error: ${err.message}` }],
            isError: true
          }
        };
        process.stdout.write(JSON.stringify(res) + "\n");
      }
      return;
    }

    if (method === "notifications/initialized") {
      return;
    }

    // Default response for unhandled methods
    const res = {
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found" }
    };
    process.stdout.write(JSON.stringify(res) + "\n");
  } catch (e) {
    // Ignore invalid JSON parse
  }
});
