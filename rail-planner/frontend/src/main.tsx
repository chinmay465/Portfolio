import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { BookingCalendar } from "./components/BookingCalendar";
import { TripPlanner } from "./components/TripPlanner";
import "./styles.css";

function App() {
  const [tab, setTab] = useState<"plan" | "calendar">("plan");
  return (
    <>
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden>
            ⟶
          </span>
          <div>
            <h1>Rail Planner</h1>
            <p>Booking windows and alternate routes for Indian Railways</p>
          </div>
        </div>
        <nav className="nav" role="tablist">
          <button role="tab" aria-selected={tab === "plan"} className={tab === "plan" ? "on" : ""} onClick={() => setTab("plan")}>
            Plan a trip
          </button>
          <button role="tab" aria-selected={tab === "calendar"} className={tab === "calendar" ? "on" : ""} onClick={() => setTab("calendar")}>
            Booking calendar
          </button>
        </nav>
      </header>
      <main>{tab === "plan" ? <TripPlanner /> : <BookingCalendar />}</main>
      <footer>
        Always confirm times on IRCTC or RailOne before booking. Booking rules as of September 2026.
      </footer>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
