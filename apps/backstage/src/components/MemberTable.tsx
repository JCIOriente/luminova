import { useEffect, useState } from "react"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@luminova/ui"
import { Member } from "../types/member"

type Props = {
  listMembers: () => Promise<Member[]>
}

function useMembersList(listMembers: () => Promise<Member[]>) {
  const [members, setMembers] = useState<Member[]>([])

  useEffect(() => {
    listMembers().then(members => {
      setMembers(members)
    })
  }, [])

  return [members]
}

export function MemberTable({ listMembers }: Props) {
  const [members] = useMembersList(listMembers)

  return (
    <Table className="border">
      <TableHeader className="bg-gray-100">
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Phone</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Points</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {members.map(member => (
          <TableRow key={member.id} className="hover:bg-gray-50">
            <TableCell>{member.name}</TableCell>
            <TableCell>{member.email}</TableCell>
            <TableCell>{member.phone}</TableCell>
            <TableCell>{member.role}</TableCell>
            <TableCell>{member.totalPoints}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
