"use client";

import { useState } from "react";
import { Icon } from "./Icon";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <button type="button" className="btn-copy" onClick={handleCopy} title={label} aria-label={label}>
      <Icon name={copied ? "check" : "content_copy"} size={16} />
      <span>{copied ? "Copied!" : label}</span>
    </button>
  );
}

export function CopyableBlock({
  label,
  value,
  mono = true,
}: {
  label?: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="copyable-block">
      {label && <p className="copyable-label">{label}</p>}
      <div className="copyable-row">
        <code className={mono ? "mono copyable-value" : "copyable-value"}>{value}</code>
        <CopyButton text={value} label="Copy" />
      </div>
    </div>
  );
}
