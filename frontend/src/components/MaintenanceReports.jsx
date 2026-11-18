import { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";

export default function MaintenanceReports({
  userId,
  initialLocation = "",
}) {
  const [location, setLocation] = useState(initialLocation);
  const [description, setDescription] = useState("");
  const [reports, setReports] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const [reportsError, setReportsError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    let active = true;

    async function loadReports() {
      try {
        if (!userId) {
          throw new Error("Please sign in to view your reports.");
        }

        const { data, error } = await supabase
          .from("maintenance_reports")
          .select("id, location, description, status, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20);

        if (error) throw error;

        if (active) {
          setReports(data ?? []);
          setReportsError("");
          setLastUpdated(new Date());
        }
      } catch (error) {
        if (active) {
          setReportsError(error.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadReports();

    return () => {
      active = false;
    };
  }, [userId, refreshKey]);

  function refreshReports() {
    if (loading || busy || !userId) return;

    setLoading(true);
    setReportsError("");
    setRefreshKey((previous) => previous + 1);
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (busy || loading || !userId) return;

    const cleanLocation = location.trim();
    const cleanDescription = description.trim();

    if (!cleanLocation || cleanLocation.length > 150) {
      setMessage("Enter a location between 1 and 150 characters.");
      return;
    }

    if (
      cleanDescription.length < 10 ||
      cleanDescription.length > 2000
    ) {
      setMessage("Enter between 10 and 2000 characters of detail.");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("maintenance_reports")
        .insert({
          user_id: userId,
          location: cleanLocation,
          description: cleanDescription,
        })
        .select("id, location, description, status, created_at")
        .single();

      if (error) throw error;

      setReports((previous) => [data, ...previous].slice(0, 20));
      setLocation("");
      setDescription("");
      setMessage("Report submitted successfully.");
    } catch (error) {
      setMessage(`Could not submit report: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  function formatStatus(status) {
    switch (status) {
      case "open":
        return "Open";
      case "in_progress":
        return "In progress";
      case "resolved":
        return "Resolved";
      default:
        return "Status unavailable";
    }
  }

  return (
    <section className="maintenance-section">
      <h2>Report a Maintenance Issue</h2>

      <form onSubmit={handleSubmit}>
        <label htmlFor="issue-location">Building and room</label>
        <input
          id="issue-location"
          placeholder="Example: Academic Block, Room 201"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          maxLength={150}
          disabled={busy}
          required
        />

        <label htmlFor="issue-description">
          Describe the problem
        </label>
        <textarea
          id="issue-description"
          placeholder="Explain what needs to be repaired."
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          minLength={10}
          maxLength={2000}
          rows={4}
          disabled={busy}
          required
        />

        <button
          type="submit"
          disabled={busy || loading || !userId}
        >
          {busy ? "Submitting..." : "Submit report"}
        </button>
      </form>

      {message && <p role="status">{message}</p>}

      <div
        style={{
          marginTop: "24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          flexWrap: "wrap",
        }}
      >
        <h3>My Latest Reports</h3>

        <button
          type="button"
          onClick={refreshReports}
          disabled={loading || busy || !userId}
        >
          {loading ? "Loading reports..." : "Refresh reports"}
        </button>
      </div>

      <p>
        Showing up to 20 latest reports. Refresh to see status
        updates from the administrator.
      </p>

      {lastUpdated && (
        <p>
          Last successful refresh: {lastUpdated.toLocaleString()}
        </p>
      )}

      {reportsError && (
        <p role="alert">
          Could not refresh reports: {reportsError}
          {reports.length > 0 &&
            " Previously loaded reports remain visible below."}
        </p>
      )}

      <div aria-busy={loading}>
        {loading && (
          <p role="status">
            {reports.length > 0
              ? "Refreshing report statuses..."
              : "Loading reports..."}
          </p>
        )}

        {!loading && !reportsError && reports.length === 0 && (
          <p>No reports to display.</p>
        )}

        {reports.map((report) => (
          <article className="report-item" key={report.id}>
            <h4>{report.location}</h4>
            <p>{report.description}</p>

            <p>
              Status: <strong>{formatStatus(report.status)}</strong>
            </p>

            <small>
              Submitted:{" "}
              {new Date(report.created_at).toLocaleString()}
            </small>
          </article>
        ))}
      </div>
    </section>
  );
}