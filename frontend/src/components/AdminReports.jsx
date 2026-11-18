import { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";

export default function AdminReports({ userId }) {
  const [reports, setReports] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    let active = true;

    async function loadReports() {
      try {
        const { data: membership, error: membershipError } =
          await supabase
            .from("admin_users")
            .select("user_id")
            .eq("user_id", userId)
            .maybeSingle();

        if (membershipError) throw membershipError;
        if (!membership) return;

        const { data, error } = await supabase
          .from("maintenance_reports")
          .select("id, location, description, status, created_at")
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) throw error;

        if (active) {
          setIsAdmin(true);
          setReports(data ?? []);
        }
      } catch (error) {
        if (active) {
          setMessage(error.message);
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
  }, [userId]);

  async function updateStatus(id, status) {
    if (!isAdmin || saving) return;

    setSaving(true);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("maintenance_reports")
        .update({ status })
        .eq("id", id)
        .select("id, status")
        .single();

      if (error) throw error;

      setReports((previous) =>
        previous.map((report) =>
          report.id === data.id
            ? { ...report, status: data.status }
            : report
        )
      );

      setMessage("Status updated successfully.");
    } catch (error) {
      setMessage(`Update failed: ${error.message}`);
    } finally {
      setSaving(false);
    }
  }

  const visibleReports = reports.filter(
    (report) =>
      statusFilter === "all" || report.status === statusFilter
  );

  if (loading) {
    return <p>Checking admin access...</p>;
  }

  if (!isAdmin) {
    return (
      <section>
        <h2>Maintenance Admin</h2>
        <p role="alert">
          {message || "This section is available to admins only."}
        </p>
      </section>
    );
  }

  return (
    <section>
      <h2>Maintenance Admin</h2>
      <p>
        Review maintenance problems and update their progress.
        Filters apply to the latest 50 loaded reports.
      </p>

      <label htmlFor="report-status-filter">
        Filter reports by status
      </label>

      <select
        id="report-status-filter"
        value={statusFilter}
        onChange={(event) => setStatusFilter(event.target.value)}
      >
        <option value="all">All statuses</option>
        <option value="open">Open</option>
        <option value="in_progress">In progress</option>
        <option value="resolved">Resolved</option>
      </select>

      <p role="status">
        Showing {visibleReports.length} of {reports.length} loaded
        reports.
      </p>

      {message && <p role="status">{message}</p>}

      {visibleReports.length === 0 ? (
        <p>
          {reports.length === 0
            ? "No reports submitted yet."
            : "No loaded reports match this status."}
        </p>
      ) : (
        visibleReports.map((report) => (
          <article className="report-item" key={report.id}>
            <h3>{report.location}</h3>

            <p>{report.description}</p>

            <p>
              Submitted:{" "}
              {new Date(report.created_at).toLocaleString()}
            </p>

            <label htmlFor={`status-${report.id}`}>
              Update status
            </label>

            <select
              id={`status-${report.id}`}
              className="admin-status"
              value={report.status}
              disabled={saving}
              onChange={(event) =>
                updateStatus(report.id, event.target.value)
              }
            >
              <option value="open">Open</option>
              <option value="in_progress">In progress</option>
              <option value="resolved">Resolved</option>
            </select>
          </article>
        ))
      )}
    </section>
  );
}