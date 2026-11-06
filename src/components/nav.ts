export interface NavLink {
  href: string;
  label: string;
}

/** The student pages, in menu order. Timetable and Attendance appear only while switched on. */
export function navLinks(timetable: boolean, attendance: boolean): NavLink[] {
  return [
    { href: '/seat', label: 'My seat' },
    ...(timetable ? [{ href: '/timetable', label: 'Timetable' }] : []),
    { href: '/homework', label: 'Homework' },
    ...(attendance ? [{ href: '/attendance', label: 'Attendance' }] : []),
    { href: '/tests', label: 'Mock tests' },
  ];
}
