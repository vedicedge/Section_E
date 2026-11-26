export interface NavLink {
  href: string;
  label: string;
}

/** The student pages, in menu order. Timetable, Attendance and Revision appear only while switched on. */
export function navLinks(timetable: boolean, attendance: boolean, revision = false): NavLink[] {
  return [
    { href: '/seat', label: 'My seat' },
    ...(timetable ? [{ href: '/timetable', label: 'Timetable' }] : []),
    { href: '/homework', label: 'Homework' },
    ...(attendance ? [{ href: '/attendance', label: 'Attendance' }] : []),
    { href: '/tests', label: 'Mock tests' },
    ...(revision ? [{ href: '/revision', label: 'Revision' }] : []),
    { href: '/study', label: 'Study material' },
    { href: '/groups', label: 'My groups' },
    { href: '/announcements', label: 'Announcements' },
    { href: '/posters', label: 'Posters' },
  ];
}
