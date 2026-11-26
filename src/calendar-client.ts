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

    private parseDate(date: string, timezone: string): string {
        const iso = date.trim().replace(" ", "T");

        if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
            return `${iso} 00:00:00`;
        }

        if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(iso)) {
            const wallClock = new Intl.DateTimeFormat("en-CA", {
                timeZone: timezone,
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hourCycle: "h23",
            }).format(new Date(iso));
            return wallClock.replace(", ", " ");
        }

        return new Date(`${iso}Z`).toISOString().replace("T", " ").slice(0, 19);
    }

    private getProfileTimezone(profile: any): string {
        return profile?.data?.preferences?.timezone?.name || "UTC";
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

        return calendars.data.calendars.find((c: any) => c.default) ?? calendars.data.calendars[0];
    }

    async getUserProfile(): Promise<any> {
        const response = await fetch(
            `https://api.infomaniak.com/2/profile`,
            {
                headers: this.headers,
            }
        );

        if (!response.ok) {
            throw new Error(`Something went wrong during profile retrieval ${await response.text()}`);
        }

        return response.json();
    }

    async getContacts(): Promise<any> {
        const response = await fetch(
            `https://api.infomaniak.com/1/calendar/pim/contact/all?with=emails`,
            {
                headers: this.headers,
            }
        );

        return response.json();
    }

    async getBookableResources(): Promise<any> {
        const response = await fetch(
            `https://api.infomaniak.com/1/calendar/pim/bookable-resources/all?with%5B%5D=permission`,
            {
                headers: this.headers,
            }
        );

        if (!response.ok) {
            return {data: []};
        }

        return response.json();
    }

    private async annotateBookableResources(events: any[]): Promise<any[]> {
        const resourceIds = new Set(
            events.map(event => event?.bookable_resource_id).filter(Boolean)
        );

        if (resourceIds.size === 0) {
            return events;
        }

        const resources = await this.getBookableResources();
        const nameByUuid = new Map<string, any>();
        for (const resource of resources?.data ?? []) {
            if (resource?.uuid) {
                nameByUuid.set(resource.uuid, resource.name);
            }
        }

        return events.map(event => event?.bookable_resource_id
            ? {...event, bookable_resource_name: nameByUuid.get(event.bookable_resource_id) ?? null}
            : event);
    }

    async listEvents(from: string, to: string, calendarId?: string): Promise<any> {
        const profile = await this.getUserProfile();
        const timezone = this.getProfileTimezone(profile);

        let calendar;
        if (calendarId) {
            calendar = {id: calendarId};
        } else {
            calendar = await this.getDefaultCalendar();
        }

        const params = new URLSearchParams({
            calendar_id: calendar.id,
            from: this.parseDate(from, timezone),
            to: this.parseDate(to, timezone),
        });

        const response = await fetch(
            `https://api.infomaniak.com/1/calendar/pim/event?${params}`,
            {headers: this.headers},
        );

        if (!response.ok) {
            throw new Error('Something went wrong during event listing');
        }

        const result = await response.json();
        result.data = await this.annotateBookableResources(result.data ?? []);
        return result;
    }

    async listTodos(calendarId?: string): Promise<any> {
        let id = calendarId;
        if (!id) {
            const calendar = await this.getDefaultCalendar();
            id = String(calendar.id);
        }

        const params = new URLSearchParams({calendar_id: id});

        const response = await fetch(
            `https://api.infomaniak.com/1/calendar/pim/task?${params}`,
            {headers: this.headers},
        );

        if (!response.ok) {
            throw new Error("Something went wrong during task listing");
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

        const result = await response.json();
        const [event] = await this.annotateBookableResources([result.data]);
        result.data = event;
        return result;
    }

    async createEvent(title: string, start: string | undefined, end: string | undefined, description: string | undefined, attendees: string | undefined, rrule: string | undefined, calendarId?: string, type: string = "event", dueDate?: string, priority?: number, progress?: number): Promise<any> {
        if (type === "todo") {
            return this.createTodo(title, description, dueDate, priority, progress, calendarId);
        }

        if (!start || !end) {
            throw new Error("start and end are required for events");
        }

        let calendar;
        if (calendarId) {
            calendar = {id: calendarId};
        } else {
            calendar = await this.getDefaultCalendar();
        }
        const profile = await this.getUserProfile();
        const calendarAttendees = await this.buildAttendees(attendees, profile);

        const body: Record<string, any> = {
            title,
            start: this.parseDate(start, this.getProfileTimezone(profile)),
            end: this.parseDate(end, this.getProfileTimezone(profile)),
            description,
            freebusy: "busy",
            type: "event",
            calendar_id: calendar.id,
            fullday: false,
            timezone_start: this.getProfileTimezone(profile),
            timezone_end: this.getProfileTimezone(profile),
            attendees: calendarAttendees,
            notifyAttendees: calendarAttendees.length > 0,
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

    private async createTodo(title: string, description: string | undefined, dueDate: string | undefined, priority: number | undefined, progress: number | undefined, calendarId?: string): Promise<any> {
        let calendar;
        if (calendarId) {
            calendar = {id: calendarId};
        } else {
            calendar = await this.getDefaultCalendar();
        }

        const body: Record<string, any> = {
            type: "todo",
            calendar_id: calendar.id,
            title,
            description,
            progress: progress ?? 0,
            priority: priority ?? 0,
            alarms: [],
            attachments: [],
        };

        if (dueDate !== undefined) {
            body.due_date = dueDate;
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
            throw new Error(`Something went wrong during task creation ${await response.text()}`);
        }

        return response.json();
    }

    async updateEvent(eventId: string, title: string | undefined, start: string | undefined, end: string | undefined, description: string | undefined, attendees: string | undefined, rrule: string | undefined, calendarId?: string, notifyAttendees: boolean = false, done?: boolean, progress?: number, type?: string, dueDate?: string, priority?: number): Promise<any> {
        const existing = await this.getEvent(eventId);
        const event = existing.data;

        if (type !== undefined && type !== event.type) {
            throw new Error(`Cannot update event ${eventId}: it is of type ${event.type}, not ${type}. The type cannot be changed.`);
        }

        if (event.type === "todo") {
            return this.updateTodo(event, eventId, title, description, calendarId, done, progress, dueDate, priority);
        }

        let calendar;
        if (calendarId) {
            calendar = {id: calendarId};
        } else {
            calendar = {id: event.calendar_id};
        }

        const profile = await this.getUserProfile();
        const timezone = this.getProfileTimezone(profile);
        const timezoneStart = event.timezone_start || timezone;
        const timezoneEnd = event.timezone_end || timezone;

        let calendarAttendees = event.attendees || [];
        if (attendees !== undefined) {
            calendarAttendees = await this.buildAttendees(attendees, profile);
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
                    start: start ? this.parseDate(start, timezoneStart) : this.parseApiDate(event.start),
                    end: end ? this.parseDate(end, timezoneEnd) : this.parseApiDate(event.end),
                    timezone_start: timezoneStart,
                    timezone_end: timezoneEnd,
                    freebusy: event.freebusy ?? "busy",
                    type: event.type ?? "event",
                    fullday: event.fullday ?? false,
                    private: event.private ?? false,
                    ...(event.location ? {location: event.location} : {}),
                    color: event.color ?? null,
                    attendees: calendarAttendees,
                    alarms: event.alarms || [],
                    attachments: event.attachments || [],
                    rrule: rrule !== undefined ? rrule : (event.rrule || ""),
                    meet_room_url: event.meet_room_url || "",
                    bookable_resource_id: event.bookable_resource_id,
                    notifyAttendees: notifyAttendees,
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

    private async updateTodo(event: any, eventId: string, title: string | undefined, description: string | undefined, calendarId: string | undefined, done: boolean | undefined, progress: number | undefined, dueDate?: string, priority?: number): Promise<any> {
        if (title === undefined && description === undefined && calendarId === undefined && dueDate === undefined && priority === undefined) {
            const body: Record<string, any> = {
                progression: progress ?? event.progress ?? 0,
                ...(done !== undefined ? {completed: done} : {}),
            };

            const response = await fetch(
                `https://api.infomaniak.com/1/calendar/pim/event/${eventId}/todo-progression`,
                {
                    headers: this.headers,
                    method: "PUT",
                    body: JSON.stringify(body)
                },
            );

            if (!response.ok) {
                throw new Error(`Something went wrong during task update ${await response.text()}`);
            }

            return response.json();
        }

        const body: Record<string, any> = {
            id: parseInt(eventId),
            calendar_id: calendarId ?? event.calendar_id,
            type: "todo",
            title: title ?? event.title,
            description: description ?? event.description ?? "",
            ...(dueDate !== undefined ? {due_date: dueDate} : event.due_date ? {due_date: event.due_date} : {}),
            ...(event.location ? {location: event.location} : {}),
            progress: progress ?? event.progress ?? 0,
            priority: priority ?? event.priority ?? 0,
            ...(event.private !== undefined ? {private: event.private} : {}),
            alarms: [],
            attachments: [],
            ...(done !== undefined ? {done} : {}),
        };

        const response = await fetch(
            `https://api.infomaniak.com/1/calendar/pim/event/${eventId}`,
            {
                headers: this.headers,
                method: "PUT",
                body: JSON.stringify(body)
            },
        );

        if (!response.ok) {
            throw new Error(`Something went wrong during task update ${await response.text()}`);
        }

        return response.json();
    }

    async deleteEvent(eventId: string, calendarId?: string, notifyAttendees: boolean = false): Promise<any> {
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
                ...(notifyAttendees ? {
                    body: JSON.stringify({notifyAttendees: true, imip_request: true}),
                } : {}),
            },
        );

        if (!response.ok) {
            throw new Error(`Something went wrong during event deletion ${await response.text()}`);
        }

        return response.json();
    }

    private async buildAttendees(attendees: string | undefined, profile: any): Promise<any[]> {
        let calendarAttendees: any[] = [];

        if (attendees) {
            let emails: string[];
            try {
                emails = JSON.parse(attendees);
            } catch (error) {
                throw new Error('Invalid attendees, JSON array of email address is expected');
            }

            if (!Array.isArray(emails) || emails.some(email => typeof email !== "string" || !email.trim())) {
                throw new Error('Invalid attendees, JSON array of email address strings is expected');
            }

            if (emails.length === 0) {
                return calendarAttendees;
            }

            const organizerEmail = profile?.data?.email;

            if (!organizerEmail) {
                throw new Error("Could not resolve the organizer email from the profile response (GET /2/profile). Check that your token has the user_info scope.");
            }

            const contacts = await this.getContacts();
            const contactByEmail = new Map<string, any>();
            for (const contact of contacts?.data ?? []) {
                for (const email of contact.emails ?? []) {
                    contactByEmail.set(String(email).toLowerCase(), contact);
                }
            }

            for (const email of emails) {
                const attendeeEmail = email.trim();
                const isOrganizer = attendeeEmail.toLowerCase() === organizerEmail.toLowerCase();
                const contact = contactByEmail.get(attendeeEmail.toLowerCase());
                calendarAttendees.push({
                    className: "Attendee",
                    ...(contact ? {contactId: contact.id} : {}),
                    address: attendeeEmail,
                    state: isOrganizer ? "ACCEPTED" : "NEEDS-ACTION",
                    name: contact?.name ?? (isOrganizer ? profile.data.display_name : undefined) ?? attendeeEmail,
                    organizer: isOrganizer,
                });
            }

            if (!calendarAttendees.some(attendee => attendee.organizer)) {
                const organizerContact = contactByEmail.get(organizerEmail.toLowerCase());
                calendarAttendees.push({
                    className: "Attendee",
                    ...(organizerContact ? {contactId: organizerContact.id} : {}),
                    address: organizerEmail,
                    name: profile.data.display_name,
                    organizer: true,
                    state: "ACCEPTED",
                });
            }
        }

        return calendarAttendees;
    }
}
