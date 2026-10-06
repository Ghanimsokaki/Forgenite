import "./globals.css";

export const metadata = {
  title: "Forgenite · Chat with 20+ AIs on NVIDIA NIM",
  description:
    "Forgenite is a fast, clean chatbot that lets you talk to dozens of frontier AI models — Llama, Nemotron, DeepSeek, Qwen, Mistral and more — through the NVIDIA NIM API.",
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
