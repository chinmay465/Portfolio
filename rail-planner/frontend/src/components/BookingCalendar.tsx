import { useState } from "react";
import { api } from "../api";
import { longDay, runDays, todayIST } from "../format";
import type { StationHit, WindowsResponse } from "../types";
import { BookingWindows } from "./BookingWindows";
import { SourceNote } from "./SourceNote";
import { StationInput } from "./StationInput";

export function BookingCalendar() {
  const [date, setDate] = useState(todayIST(1));
  const [train, setTrain] = useState("");
  const [board, setBoard] = useState<StationHit | null>(null);
  const [data, setData] = useState<WindowsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setError(null);
    try {
      setData(await api.windows(date, train.trim() || undefined, train.trim() ? board?.code : undefined));
    } catch (e) {
      setData(null);
      setError((e as Error).message);
    }
  };

  return (
    <div className="calendar">
      <form
        className="card search"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <div className="row">
          <div className="field date">
            <label htmlFor="cal-date">Journey date</label>
            <input id="cal-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="cal-train">Train number (optional)</label>
            <input id="cal-train" inputMode="numeric" placeholder="e.g. 12627" value={train} onChange={(e) => setTrain(e.target.value)} />
          </div>
          <StationInput label="Boarding station (optional)" value={board} onChange={setBoard} placeholder="Where you get on" />
          <button type="submit" className="primary">
            Show windows
          </button>
        </div>
        <p className="muted small">
          Windows are counted from the day the train leaves its <b>origin</b>. Add the train and your boarding station if you're joining a train
          that started the previous day.
        </p>
      </form>

      {error && <p className="error" role="alert">{error}</p>}

      {data && (
        <section className="card">
          <h2>
            {data.train ? `${data.train.number} ${data.train.name}` : "Any train"}
            <span className="muted"> · {longDay(data.journey_date + "T12:00:00+05:30")}</span>
          </h2>
          {data.train && (
            <>
              <SourceNote source={data.data_source} />
              <p className="muted">
                Boarding at {data.train.board.name} on day {data.train.board_day} of the run
                {data.origin_date !== data.journey_date && <> — train leaves origin {longDay(data.origin_date + "T12:00:00+05:30")}</>}.
                Runs: {runDays(data.train.runs_on)}.
              </p>
              {!data.train.runs_on_date && (
                <p className="error" role="alert">
                  {data.train.number} doesn't run on this date from {data.train.board.name}. Pick another date or train.
                </p>
              )}
            </>
          )}
          <BookingWindows
            windows={data.windows}
            title={data.train ? `${data.train.number}` : `Journey ${data.journey_date}`}
            detail={data.train ? `${data.train.name}, board ${data.train.board.name}` : `Journey on ${data.journey_date}`}
          />
        </section>
      )}

      <section className="card tips">
        <h3>Booking-day checklist</h3>
        <ol>
          <li>Complete Aadhaar authentication on your IRCTC account. Tatkal needs it, and on opening day only verified users can book general tickets online.</li>
          <li>Save passengers in the IRCTC Master List so the form fills in a couple of taps.</li>
          <li>Top up the RailOne R-Wallet or IRCTC eWallet the day before, so payment is one confirmation.</li>
          <li>Log in 5 minutes before the window (08:00 general, 10:00 AC Tatkal, 11:00 non-AC Tatkal) on one device.</li>
          <li>Have a second-choice train ready from the alternate routes list.</li>
        </ol>
      </section>
    </div>
  );
}
