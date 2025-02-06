import { Link } from 'react-router-dom';
import { Button } from '@luminova/ui'
import { LayoutDashboard, Users, Calendar, Settings } from 'lucide-react'

export function Sidebar() {
  return (
    <div className="w-64 border-r bg-gray-50 p-4">
      <div className="mb-6">
        <h1 className="text-xl font-bold">Backstage</h1>
      </div>
      <nav className="space-y-2">
        <Button variant="ghost" className="w-full justify-start" asChild>
          <Link to="/" className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Link>
        </Button>
        <Button variant="ghost" className="w-full justify-start" asChild>
          <Link to="/members" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            Members
          </Link>
        </Button>
        <Button variant="ghost" className="w-full justify-start" asChild>
          <Link to="/events" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            Events
          </Link>
        </Button>
        <Button variant="ghost" className="w-full justify-start" asChild>
          <Link to="/settings" className="flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Settings
          </Link>
        </Button>
      </nav>
    </div>
  )
}
