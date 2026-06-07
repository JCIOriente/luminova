import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DataTable, type DataTableColumn, type FilterChip } from "./data-table";

interface Row {
  id: string;
  name: string;
  status: string;
  points: number;
}

const rows: Row[] = [
  { id: "a", name: "Ana", status: "Activo", points: 30 },
  { id: "b", name: "Beto", status: "Inactivo", points: 10 },
  { id: "c", name: "Carla", status: "Activo", points: 20 },
];

const columns: DataTableColumn<Row>[] = [
  { id: "name", header: "Nombre", cell: (r) => r.name, sortValue: (r) => r.name },
  { id: "status", header: "Estado", cell: (r) => r.status },
  { id: "points", header: "Puntos", cell: (r) => r.points, sortValue: (r) => r.points },
];

const chips: FilterChip[] = [
  { id: "Activo", label: "Activo", active: false },
  { id: "Inactivo", label: "Inactivo", active: false },
];

function bodyNames() {
  const table = screen.getByRole("table");
  return within(table)
    .getAllByRole("row")
    .slice(1)
    .map((row) => within(row).getAllByRole("cell")[0]?.textContent);
}

describe("DataTable", () => {
  it("renders every row by default", () => {
    render(<DataTable rows={rows} columns={columns} getRowId={(r) => r.id} />);
    expect(bodyNames()).toEqual(["Ana", "Beto", "Carla"]);
  });

  it("filters rows as the user types in the search box", async () => {
    render(
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        searchText={(r) => `${r.name} ${r.status}`}
        searchPlaceholder="Buscar miembros"
      />,
    );
    await userEvent.type(screen.getByPlaceholderText("Buscar miembros"), "ana");
    expect(bodyNames()).toEqual(["Ana"]);
  });

  it("filters rows when a chip is toggled on", async () => {
    render(
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        chips={chips}
        chipPredicate={(row, ids) => ids.includes(row.status)}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: "Inactivo" }));
    expect(bodyNames()).toEqual(["Beto"]);
  });

  it("sorts ascending then descending when a sortable header is clicked", async () => {
    render(<DataTable rows={rows} columns={columns} getRowId={(r) => r.id} />);
    const pointsHeader = screen.getByRole("button", { name: /puntos/i });

    await userEvent.click(pointsHeader);
    expect(bodyNames()).toEqual(["Beto", "Carla", "Ana"]);
    expect(pointsHeader.closest("th")).toHaveAttribute("aria-sort", "ascending");

    await userEvent.click(pointsHeader);
    expect(bodyNames()).toEqual(["Ana", "Carla", "Beto"]);
    expect(pointsHeader.closest("th")).toHaveAttribute("aria-sort", "descending");
  });

  it("renders skeleton rows while loading", () => {
    const { container } = render(
      <DataTable rows={[]} columns={columns} getRowId={(r) => r.id} isLoading />,
    );
    expect(container.querySelectorAll("[aria-hidden='true']").length).toBeGreaterThan(0);
  });

  it("shows the provided empty state when there are no rows", () => {
    render(
      <DataTable
        rows={[]}
        columns={columns}
        getRowId={(r) => r.id}
        emptyState={<div>No hay nada</div>}
      />,
    );
    expect(screen.getByText("No hay nada")).toBeInTheDocument();
  });

  it("calls onRowClick with the row when a row is clicked", async () => {
    let clicked: Row | null = null;
    render(
      <DataTable
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        onRowClick={(row) => {
          clicked = row;
        }}
      />,
    );
    await userEvent.click(screen.getByText("Beto"));
    expect(clicked).toEqual(rows[1]);
  });
});
