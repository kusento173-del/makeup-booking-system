import type { ScheduleArtist } from './schedule-board-api';

export interface ScheduleFilters {
  readonly appointmentType: 'ALL' | 'FIXED' | 'SINGLE';
  readonly artistId: string;
  readonly query: string;
  readonly status: 'ALL' | 'BOOKED' | 'COMPLETED';
}

function searchable(value: string): string {
  return value.normalize('NFKC').trim().toLocaleLowerCase('zh-CN');
}

export function filterScheduleArtists(
  artists: readonly ScheduleArtist[],
  filters: ScheduleFilters,
): readonly ScheduleArtist[] {
  const query = searchable(filters.query);
  const filtersAppointments =
    query.length > 0 || filters.appointmentType !== 'ALL' || filters.status !== 'ALL';

  return artists.flatMap((artist) => {
    if (filters.artistId && artist.artistId !== filters.artistId) return [];
    const artistMatches = searchable(artist.artistNickname).includes(query);
    const appointments = artist.appointments.filter(
      (appointment) =>
        (filters.appointmentType === 'ALL' ||
          appointment.appointmentType === filters.appointmentType) &&
        (filters.status === 'ALL' || appointment.status === filters.status) &&
        (artistMatches ||
          !query ||
          searchable(appointment.hostCode).includes(query) ||
          searchable(appointment.hostName).includes(query)),
    );
    return appointments.length > 0 || !filtersAppointments ? [{ ...artist, appointments }] : [];
  });
}
