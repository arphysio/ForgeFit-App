import React from "react";

export default function Page() {
  return React.createElement(
    "main",
    { className: "card" },
    React.createElement("h1", null, "ForgeFit App"),
    React.createElement(
      "p",
      null,
      "React is now set up. You can start building your app components here."
    )
  );
}
