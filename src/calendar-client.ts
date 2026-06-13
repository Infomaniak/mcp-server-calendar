export class CalendarClient {
    private readonly token: string;
    private readonly headers: { Authorization: string; "Content-Type": string };

    constructor(token: string) {
        this.token = token;
        this.headers = {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
        };
    }

    private parseDate(date: Date) {
        return date.toISOString()
            .replace("T", " ")
            .replace("Z", "")
            .slice(0, -4);
    }

    async getCalendars(): Promise<any> {
        const response = await fetch(
            `https://api.infomaniak.com/1/calendar/pim/calendar`,
            {
                headers: this.headers,
            }
        );

        return response.json();
    }

    async getDefaultCalendar(): Promise<any> {
        const calendars = await this.getCalendars();

        return calendars.data.calendars[0];
    }

    async getUserProfile(): Promise<any> {
        const response = await fetch(
            `https://api.infomaniak.com/2/profile`,
            {
                headers: this.headers,
            }
        );

        return response.json();
    }

    async listEvents(from: string, to: string, calendarId?: string): Promise<any> {
        let calendar;
        if (calendarId) {
            calendar = {id: calendarId};
        } else {
            calendar = await this.getDefaultCalendar();
        }

        const params = new URLSearchParams({
            calendar_id: calendar.id,
            from: this.parseDate(new Date(from)),
            to: this.parseDate(new Date(to)),
        });

        const response = await fetch(
            `https://api.infomaniak.com/1/calendar/pim/event?${params}`,
            {headers: this.headers},
        );

        if (!response.ok) {
            throw new Error('Something went wrong during event listing');
        }

        return response.json();
    }

    async createEvent(title: string, start: string, end: string, description: string | undefined, attendees: string | undefined, calendarId?: string): Promise<any> {
        let calendar;
        if (calendarId) {
            calendar = {id: calendarId};
        } else {
            calendar = await this.getDefaultCalendar();
        }
        const profile = await this.getUserProfile();
        let calendarAttendees: {
            address: any;
            className: string;
            name: any;
            organizer: boolean;
            state: string;
        }[] = [];

        if (attendees) {
            try {
                calendarAttendees = JSON.parse(attendees).map((attendee: any) => ({
                    address: attendee,
                    className: "Attendee",
                    name: attendee,
                    organizer: false,
                    state: "NEEDS-ACTION",
                }));

                calendarAttendees.push({
                    address: profile.data.email,
                    className: "Attendee",
                    name: profile.data.display_name,
                    organizer: true,
                    state: "ACCEPTED",
                })
            } catch (error) {
                throw new Error('Invalid attendees, JSON array of email address is expected');
            }
        }

        const response = await fetch(
            `https://api.infomaniak.com/1/calendar/pim/event`,
            {
                headers: this.headers,
                method: "POST",
                body: JSON.stringify({
                    title,
                    start: this.parseDate(new Date(start)),
                    end: this.parseDate(new Date(end)),
                    description,
                    freebusy: "busy",
                    type: "event",
                    calendar_id: calendar.id,
                    fullday: false,
                    timezone_start: profile.data.preferences.timezone.name,
                    timezone_end: profile.data.preferences.timezone.name,
                    attendees: calendarAttendees
                })
            },
        );

        if (!response.ok) {
            throw new Error(`Something went wrong during event creation ${await response.text()}`);
        }

        return response.json();
    }
}
