import { Routes, Route } from "react-router-dom";
import V1App from "./pages/V1App";
import V2App from "./pages/V2App";

function App() {
  return (
    <Routes>
      <Route path="/" element={<V1App />} />
      <Route path="/ver2" element={<V2App />} />
      <Route path="*" element={<V1App />} />
    </Routes>
  );
}

export default App;
