import React, { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Users } from "lucide-react";

import { useCreateRoom } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const joinSchema = z.object({
  userName: z.string().min(2, "Name must be at least 2 characters."),
  roomId: z.string().min(1, "Room ID is required to join."),
});

const createSchema = z.object({
  userName: z.string().min(2, "Name must be at least 2 characters."),
});

export default function Home() {
  const [, setLocation] = useLocation();
  const createRoom = useCreateRoom();
  const [activeTab, setActiveTab] = useState<"join" | "create">("join");

  const joinForm = useForm<z.infer<typeof joinSchema>>({
    resolver: zodResolver(joinSchema),
    defaultValues: {
      userName: sessionStorage.getItem("tutorcall-username") || "",
      roomId: "",
    },
  });

  const createForm = useForm<z.infer<typeof createSchema>>({
    resolver: zodResolver(createSchema),
    defaultValues: {
      userName: sessionStorage.getItem("tutorcall-username") || "",
    },
  });

  const onJoinSubmit = (data: z.infer<typeof joinSchema>) => {
    sessionStorage.setItem("tutorcall-username", data.userName);
    setLocation(`/room/${data.roomId}`);
  };

  const onCreateSubmit = (data: z.infer<typeof createSchema>) => {
    sessionStorage.setItem("tutorcall-username", data.userName);
    createRoom.mutate(
      { data: { hostName: data.userName } },
      {
        onSuccess: (room) => {
          setLocation(`/room/${room.id}`);
        },
      }
    );
  };

  return (
    <div className="landing-bg min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-8">

        {/* Logo */}
        <div className="text-center space-y-3">
          <img
            src="/nogadex-logo.png"
            alt="Nogadex"
            className="h-12 mx-auto object-contain"
          />
          <p className="text-sm font-medium" style={{ color: "hsl(220 8% 42%)" }}>
            A professional space for focused tutoring
          </p>
        </div>

        {/* Glass card */}
        <div className="glass rounded-3xl overflow-hidden">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "join" | "create")}>
            <TabsList
              className="w-full grid grid-cols-2 rounded-none border-b h-12"
              style={{
                background: "rgba(255,248,240,0.40)",
                borderColor: "rgba(255,248,240,0.50)",
              }}
            >
              <TabsTrigger
                value="join"
                className="rounded-none font-medium text-sm data-[state=active]:shadow-none"
                style={{ color: "hsl(220 8% 30%)" }}
              >
                Join Session
              </TabsTrigger>
              <TabsTrigger
                value="create"
                className="rounded-none font-medium text-sm data-[state=active]:shadow-none"
                style={{ color: "hsl(220 8% 30%)" }}
              >
                Create Session
              </TabsTrigger>
            </TabsList>

            {/* Join */}
            <TabsContent value="join" className="p-6 space-y-5">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: "hsl(220 8% 18%)" }}>
                  Join a room
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "hsl(220 5% 48%)" }}>
                  Enter your name and the room code from your tutor.
                </p>
              </div>
              <Form {...joinForm}>
                <form onSubmit={joinForm.handleSubmit(onJoinSubmit)} className="space-y-4">
                  <FormField
                    control={joinForm.control}
                    name="userName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(220 5% 48%)" }}>
                          Your Name
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Jane Doe"
                            className="rounded-xl h-11 border-0 focus-visible:ring-1 text-sm"
                            style={{ background: "rgba(240,233,216,0.55)" }}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={joinForm.control}
                    name="roomId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(220 5% 48%)" }}>
                          Room Code
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="e.g. A3F9C2B1"
                            className="rounded-xl h-11 border-0 focus-visible:ring-1 text-sm font-mono tracking-widest uppercase"
                            style={{ background: "rgba(240,233,216,0.55)" }}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full h-11 rounded-xl font-semibold text-sm gap-2"
                    style={{ background: "hsl(345 65% 28%)", color: "#fff" }}
                  >
                    Join Room
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </form>
              </Form>
            </TabsContent>

            {/* Create */}
            <TabsContent value="create" className="p-6 space-y-5">
              <div>
                <h2 className="text-lg font-semibold" style={{ color: "hsl(220 8% 18%)" }}>
                  Create a room
                </h2>
                <p className="text-xs mt-0.5" style={{ color: "hsl(220 5% 48%)" }}>
                  Start a new tutoring session as the host.
                </p>
              </div>
              <Form {...createForm}>
                <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                  <FormField
                    control={createForm.control}
                    name="userName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs font-semibold uppercase tracking-wider" style={{ color: "hsl(220 5% 48%)" }}>
                          Your Name
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Dr. Smith"
                            className="rounded-xl h-11 border-0 focus-visible:ring-1 text-sm"
                            style={{ background: "rgba(240,233,216,0.55)" }}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="submit"
                    className="w-full h-11 rounded-xl font-semibold text-sm gap-2"
                    style={{ background: "hsl(345 65% 28%)", color: "#fff" }}
                    disabled={createRoom.isPending}
                  >
                    {createRoom.isPending ? "Creating..." : "Create Room"}
                    {!createRoom.isPending && <Users className="h-4 w-4" />}
                  </Button>
                </form>
              </Form>
            </TabsContent>
          </Tabs>
        </div>

        <p className="text-center text-xs" style={{ color: "hsl(220 5% 56%)" }}>
          No account required. Just enter your name and go.
        </p>
      </div>
    </div>
  );
}
