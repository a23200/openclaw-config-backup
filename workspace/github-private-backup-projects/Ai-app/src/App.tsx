import { Route, Routes } from "react-router-dom";
import HomePage from "./pages/HomePage";
import ProjectEditorPage from "./pages/ProjectEditorPage";
import BuildProgressPage from "./pages/BuildProgressPage";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/projects/:id/edit" element={<ProjectEditorPage />} />
      <Route path="/builds/:id" element={<BuildProgressPage />} />
    </Routes>
  );
}
