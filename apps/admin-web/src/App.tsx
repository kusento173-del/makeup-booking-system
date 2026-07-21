import { appMetadata } from './app-metadata';

export function App() {
  return (
    <main className="app-shell">
      <p>{appMetadata.stage}</p>
      <h1>{appMetadata.name}</h1>
      <span>正式业务功能将在后续迭代中实现。</span>
    </main>
  );
}
