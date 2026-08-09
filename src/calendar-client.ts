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

    private parseApiDate(dateStr: string): string {
        return dateStr.replace("T", " ").replace(/\+.*/, "").replace("Z", "").slice(0, 19);
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

    async getEvent(eventId: string): Promise<any> {
        const response = await fetch(
            `https://api.infomaniak.com/1/calendar/pim/event/${eventId}`,
            {headers: this.headers},
        );

        if (!response.ok) {
            throw new Error(`Something went wrong during event retrieval ${await response.text()}`);
        }

        return response.json();
    }

    async createEvent(title: string, start: string, end: string, description: string | undefined, attendees: string | undefined, rrule: string | undefined, calendarId?: string): Promise<any> {
        let calendar;
        if (calendarId) {
            calendar = {id: calendarId};
        } else {
            calendar = await this.getDefaultCalendar();
        }
        const profile = await this.getUserProfile();
        const calendarAttendees = this.buildAttendees(attendees, profile);

        const body: Record<string, any> = {
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
            attendees: calendarAttendees,
        };

        if (rrule !== undefined) {
            body.rrule = rrule;
        }

        const response = await fetch(
            `https://api.infomaniak.com/1/calendar/pim/event`,
            {
                headers: this.headers,
                method: "POST",
                body: JSON.stringify(body)
            },
        );

        if (!response.ok) {
            throw new Error(`Something went wrong during event creation ${await response.text()}`);
        }

        return response.json();
    }

    async updateEvent(eventId: string, title: string | undefined, start: string | undefined, end: string | undefined, description: string | undefined, attendees: string | undefined, rrule: string | undefined, calendarId?: string): Promise<any> {
        const existing = await this.getEvent(eventId);
        const event = existing.data;

        let calendar;
        if (calendarId) {
            calendar = {id: calendarId};
        } else {
            calendar = {id: event.calendar_id};
        }

        const profile = await this.getUserProfile();
        const timezone = profile.data.preferences.timezone.name;
        const timezoneStart = event.timezone_start || timezone;
        const timezoneEnd = event.timezone_end || timezone;

        let calendarAttendees = event.attendees || [];
        if (attendees !== undefined) {
            calendarAttendees = this.buildAttendees(attendees, profile);
        }

        const response = await fetch(
            `https://api.infomaniak.com/1/calendar/pim/event/${eventId}`,
            {
                headers: this.headers,
                method: "PUT",
                body: JSON.stringify({
                    id: parseInt(eventId),
                    calendar_id: calendar.id,
                    title: title ?? event.title,
                    description: description ?? event.description ?? "",
                    start: start ? this.parseDate(new Date(start)) : this.parseApiDate(event.start),
                    end: end ? this.parseDate(new Date(end)) : this.parseApiDate(event.end),
                    timezone_start: timezoneStart,
                    timezone_end: timezoneEnd,
                    freebusy: event.freebusy ?? "busy",
                    type: event.type ?? "event",
                    fullday: event.fullday ?? false,
                    private: event.private ?? false,
                    attendees: calendarAttendees,
                    alarms: event.alarms || [],
                    attachments: event.attachments || [],
                    rrule: rrule !== undefined ? rrule : (event.rrule || ""),
                    meet_room_url: event.meet_room_url || "",
                    bookable_resource_id: event.bookable_resource_id,
                    notifyAttendees: false,
                    parent_updated: false,
                    imip_request: false,
                })
            },
        );

        if (!response.ok) {
            throw new Error(`Something went wrong during event update ${await response.text()}`);
        }

        return response.json();
    }

    async deleteEvent(eventId: string, calendarId?: string): Promise<any> {
        let calendar;
        if (calendarId) {
            calendar = {id: calendarId};
        } else {
            calendar = await this.getDefaultCalendar();
        }

        const params = new URLSearchParams({
            calendar_id: typeof calendar.id === "number" ? calendar.id.toString() : calendar.id,
        });

        const response = await fetch(
            `https://api.infomaniak.com/1/calendar/pim/event/${eventId}?${params}`,
            {
                headers: this.headers,
                method: "DELETE",
            },
        );

        if (!response.ok) {
            throw new Error(`Something went wrong during event deletion ${await response.text()}`);
        }

        return response.json();
    }

    private buildAttendees(attendees: string | undefined, profile: any): any[] {
        let calendarAttendees: any[] = [];

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
                });
            } catch (error) {
                throw new Error('Invalid attendees, JSON array of email address is expected');
            }
        }

        return calendarAttendees;
    }
}
