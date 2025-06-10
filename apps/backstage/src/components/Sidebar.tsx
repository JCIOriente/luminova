import { Button } from "@luminova/ui";
import {
  Calendar,
  LayoutDashboard,
  Scale,
  Settings,
  UserRoundPlus,
  Users,
} from "lucide-react";
import { NavLink } from "react-router-dom";
import { useLogout } from "../features/auth";

export const Sidebar = () => {
  const { mutate: logout } = useLogout();

  return (
    <div className="flex h-screen w-64 flex-col border-r bg-gray-50 p-4">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Backstage</h1>
      </div>

      <nav className="space-y-2">
        <Button variant="ghost" className="w-full justify-start" asChild>
          <NavLink to="/" className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </NavLink>
        </Button>
        <Button variant="ghost" className="w-full justify-start" asChild>
          <NavLink to="/point-rules" className="flex items-center gap-2">
            <Scale className="h-4 w-4" />
            Point Rules
          </NavLink>
        </Button>
        <Button variant="ghost" className="w-full justify-start" asChild>
          <NavLink to="/members" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Members
          </NavLink>
        </Button>
        <Button variant="ghost" className="w-full justify-start" asChild>
          <NavLink to="/events" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Events
          </NavLink>
        </Button>
        <Button variant="ghost" className="w-full justify-start" asChild>
          <NavLink to="/allies" className="flex items-center gap-2">
            <UserRoundPlus className="h-4 w-4" />
            Allies
          </NavLink>
        </Button>
        <Button variant="ghost" className="w-full justify-start" asChild>
          <NavLink to="/settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </NavLink>
        </Button>
      </nav>

      <div className="mt-auto">
        <Button
          variant="destructive"
          className="w-full justify-center"
          onClick={() => logout()}
        >
          Logout
        </Button>
      </div>
    </div>
  );
};
