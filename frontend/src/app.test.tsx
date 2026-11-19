import { render, screen } from "@testing-library/react";

function FoundationMessage() {
  return <h1>Fondasi aplikasi siap digunakan.</h1>;
}

test("renders the foundation message", () => {
  render(<FoundationMessage />);
  expect(screen.getByRole("heading", { name: /fondasi aplikasi/i })).toBeTruthy();
});
