import { createBrowserRouter } from "react-router-dom"
import { HomePage } from "./Home"
import { StaffPage } from "./Staff"

export const router = createBrowserRouter([
  {
    path: "/",
    element: <HomePage />,
  },
  {
    path: "/staff",
    element: <StaffPage />,
  },
])
