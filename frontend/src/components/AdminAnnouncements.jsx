import { useEffect, useRef, useState } from "react";
import { supabase } from "../services/supabaseClient";

const announcementColumns =
  "id, title, message, is_published, created_at";

export default function AdminAnnouncements({ userId }) {
  const [announcements, setAnnouncements] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [accessError, setAccessError] = useState("");
  const [listError, setListError] = useState("");

  const [editingId, setEditingId] = useState(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [visibility, setVisibility] = useState("draft");
  const [filter, setFilter] = useState("all");

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const formRef = useRef(null);
  const requestInProgress = useRef(false);

  useEffect(() => {
    let active = true;

    async function loadData() {
      try {
        if (!userId) {
          throw new Error("Please sign in.");
        }

        const { data: membership, error: membershipError } =
          await supabase
            .from("admin_users")
            .select("user_id")
            .eq("user_id", userId)
            .maybeSingle();

        if (membershipError) throw membershipError;
        if (!active || !membership) return;

        setIsAdmin(true);

        const { data, error } = await supabase
          .from("announcements")
          .select(announcementColumns)
          .order("created_at", { ascending: false })
          .limit(50);

        if (!active) return;

        if (error) {
          setListError(error.message);
          return;
        }

        setAnnouncements(data ?? []);
      } catch (error) {
        if (active) {
          setAccessError(error.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      active = false;
    };
  }, [userId]);

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setVisibility("draft");
  }

  function startEditing(announcement) {
    if (requestInProgress.current) return;

    setEditingId(announcement.id);
    setTitle(announcement.title);
    setBody(announcement.message);
    setVisibility(
      announcement.is_published ? "published" : "draft"
    );
    setMessage("");

    formRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }

  function cancelEditing() {
    if (requestInProgress.current) return;

    resetForm();
    setMessage("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!isAdmin || requestInProgress.current) return;

    const cleanTitle = title.trim();
    const cleanBody = body.trim();

    if (
      cleanTitle.length === 0 ||
      cleanTitle.length > 150 ||
      cleanBody.length === 0 ||
      cleanBody.length > 3000
    ) {
      setMessage(
        "Enter a title of 1–150 characters and announcement text of 1–3000 characters."
      );
      return;
    }

    const idToEdit = editingId;
    const published = visibility === "published";

    requestInProgress.current = true;
    setBusy(true);
    setMessage("");

    try {
      const values = {
        title: cleanTitle,
        message: cleanBody,
        is_published: published,
      };

      const query =
        idToEdit !== null
          ? supabase
            .from("announcements")
            .update(values)
            .eq("id", idToEdit)
          : supabase.from("announcements").insert(values);

      const { data, error } = await query
        .select(announcementColumns)
        .single();

      if (error) throw error;

      setAnnouncements((previous) =>
        idToEdit !== null
          ? previous.map((announcement) =>
            announcement.id === data.id ? data : announcement
          )
          : [data, ...previous]
      );

      resetForm();

      setMessage(
        published
          ? "Announcement saved and published to students."
          : "Draft saved. It is hidden from students."
      );
    } catch (error) {
      setMessage(`Could not save: ${error.message}`);
    } finally {
      requestInProgress.current = false;
      setBusy(false);
    }
  }

  async function changeVisibility(announcement) {
    if (
      !isAdmin ||
      requestInProgress.current ||
      editingId !== null
    ) {
      return;
    }

    requestInProgress.current = true;
    setBusy(true);
    setMessage("");

    try {
      const { data, error } = await supabase
        .from("announcements")
        .update({
          is_published: !announcement.is_published,
        })
        .eq("id", announcement.id)
        .select(announcementColumns)
        .single();

      if (error) throw error;

      setAnnouncements((previous) =>
        previous.map((item) =>
          item.id === data.id ? data : item
        )
      );

      setMessage(
        data.is_published
          ? "Announcement published to students."
          : "Announcement unpublished and saved as a draft."
      );
    } catch (error) {
      setMessage(`Could not change visibility: ${error.message}`);
    } finally {
      requestInProgress.current = false;
      setBusy(false);
    }
  }

  const visibleAnnouncements = announcements.filter(
    (announcement) => {
      if (filter === "published") {
        return announcement.is_published;
      }

      if (filter === "draft") {
        return !announcement.is_published;
      }

      return true;
    }
  );

  if (loading) {
    return <p>Loading announcement management...</p>;
  }

  if (!isAdmin) {
    return (
      <p role="alert">
        {accessError || "This section is available to admins only."}
      </p>
    );
  }

  return (
    <section>
      <h2>Manage Announcements</h2>
      <p>
        Create notices, edit their content, and control whether
        students can see them.
      </p>

      <form ref={formRef} onSubmit={handleSubmit}>
        <h3>
          {editingId !== null
            ? "Edit announcement"
            : "Create announcement"}
        </h3>

        <fieldset
          disabled={busy}
          style={{ border: 0, padding: 0, margin: 0 }}
        >
          <label htmlFor="notice-title">Title</label>
          <input
            id="notice-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={150}
            required
          />

          <label htmlFor="notice-body">Announcement</label>
          <textarea
            id="notice-body"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={3000}
            rows={5}
            required
          />

          <label htmlFor="notice-visibility">Visibility</label>
          <select
            id="notice-visibility"
            value={visibility}
            onChange={(event) => setVisibility(event.target.value)}
          >
            <option value="draft">Save as draft</option>
            <option value="published">Publish to students</option>
          </select>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              marginTop: "12px",
            }}
          >
            <button type="submit">
              {busy
                ? "Saving..."
                : editingId !== null
                  ? "Save changes"
                  : visibility === "published"
                    ? "Publish announcement"
                    : "Save draft"}
            </button>

            {editingId !== null && (
              <button type="button" onClick={cancelEditing}>
                Cancel editing
              </button>
            )}
          </div>
        </fieldset>
      </form>

      {message && <p role="status">{message}</p>}

      <h3 style={{ marginTop: "28px" }}>
        Existing announcements
      </h3>

      <p>
        Loads the latest 50 announcements, plus notices created
        in this session. Filters apply to loaded records.
      </p>

      {listError && (
        <p role="alert">
          Could not load the existing announcements: {listError}.
          Refresh the page to retry after saving any draft you
          are typing.
        </p>
      )}

      <label htmlFor="notice-filter">Filter by visibility</label>
      <select
        id="notice-filter"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      >
        <option value="all">All announcements</option>
        <option value="published">Published</option>
        <option value="draft">Drafts</option>
      </select>

      <p role="status">
        Showing {visibleAnnouncements.length} of{" "}
        {announcements.length} loaded announcements.
      </p>

      {editingId !== null && (
        <p>
          Save or cancel your current edit before changing another
          announcement.
        </p>
      )}

      {visibleAnnouncements.length === 0 ? (
        !listError && (
          <p>
            {announcements.length === 0
              ? "No announcements have been created yet."
              : "No loaded announcements match this filter."}
          </p>
        )
      ) : (
        visibleAnnouncements.map((announcement) => (
          <article
            className="report-item"
            key={announcement.id}
          >
            <h4>{announcement.title}</h4>

            <p style={{ whiteSpace: "pre-wrap" }}>
              {announcement.message}
            </p>

            <p>
              Visibility:{" "}
              <strong>
                {announcement.is_published ? "Published" : "Draft"}
              </strong>
            </p>

            <p>
              Created:{" "}
              {new Date(
                announcement.created_at
              ).toLocaleString()}
            </p>

            <div
              style={{
                display: "flex",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                disabled={busy || editingId !== null}
                onClick={() => startEditing(announcement)}
              >
                {editingId === announcement.id
                  ? "Currently editing"
                  : "Edit announcement"}
              </button>

              <button
                type="button"
                disabled={busy || editingId !== null}
                onClick={() => changeVisibility(announcement)}
              >
                {announcement.is_published
                  ? "Unpublish"
                  : "Publish"}
              </button>
            </div>
          </article>
        ))
      )}
    </section>
  );
}