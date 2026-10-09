import "./globals.css";
import "./workspace.css";

export const metadata = {
  title: "Forgenite · AI chat, web builder & 24/7 automations on NVIDIA NIM",
  description:
    "Forgenite is a fast, clean chatbot + autonomous agent that lets you talk to dozens of frontier AI models — GLM-5.3, Kimi K3, DeepSeek V4, Nemotron 3, GPT-OSS, Llama, Qwen3 and more — through the NVIDIA NIM API.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#070b10",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
