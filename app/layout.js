import "./globals.css";

export const metadata = { title: "Skyjo" };

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
