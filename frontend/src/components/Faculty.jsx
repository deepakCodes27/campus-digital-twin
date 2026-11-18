import { useEffect, useState } from "react";
import { supabase } from "../services/supabaseClient";

export default function Faculty() {
  const [faculty, setFaculty] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;

    async function loadFaculty() {
      try {
        const { data, error } = await supabase
          .from("faculty")
          .select(
            "id, name, department, designation, office_location, office_hours"
          )
          .order("name");

        if (error) throw error;
        if (active) setFaculty(data ?? []);
      } catch (error) {
        if (active) setErrorMessage(error.message);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadFaculty();

    return () => {
      active = false;
    };
  }, []);

  const query = search.trim().toLowerCase();

  const results = faculty.filter((person) =>
    `${person.name} ${person.department} ${person.office_location}`
      .toLowerCase()
      .includes(query)
  );

  return (
    <section>
      <h2>Faculty Directory</h2>

      <label htmlFor="faculty-search">
        Search by name, department, or office
      </label>

      <input
        id="faculty-search"
        type="search"
        placeholder="Example: Computer Science"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />

      {loading ? (
        <p>Loading faculty...</p>
      ) : errorMessage ? (
        <p role="alert">Could not load faculty: {errorMessage}</p>
      ) : results.length === 0 ? (
        <p>No matching faculty found.</p>
      ) : (
        <div className="faculty-grid">
          {results.map((person) => (
            <article className="faculty-item" key={person.id}>
              <h3>{person.name}</h3>
              <p>{person.designation}</p>
              <p><strong>Department:</strong> {person.department}</p>
              <p><strong>Office:</strong> {person.office_location}</p>
              <p>
                <strong>Office hours:</strong>{" "}
                {person.office_hours || "Not specified"}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}