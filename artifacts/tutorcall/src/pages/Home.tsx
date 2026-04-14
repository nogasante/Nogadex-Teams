import React, { useState, useEffect } from "react";
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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center space-y-2">
          <img src="/nogadex-logo.png" alt="Nogadex" className="h-14 mx-auto mb-2 object-contain" />
          <p className="text-slate-500 text-lg">A professional space for focused tutoring.</p>
        </div>

        <Card className="shadow-lg border-0">
          <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="join">Join Session</TabsTrigger>
              <TabsTrigger value="create">Create Session</TabsTrigger>
            </TabsList>
            
            <TabsContent value="join">
              <CardHeader>
                <CardTitle>Join a Room</CardTitle>
                <CardDescription>Enter your name and the room code provided by your tutor or student.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...joinForm}>
                  <form onSubmit={joinForm.handleSubmit(onJoinSubmit)} className="space-y-4">
                    <FormField
                      control={joinForm.control}
                      name="userName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your Name</FormLabel>
                          <FormControl>
                            <Input placeholder="E.g., Jane Doe" {...field} />
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
                          <FormLabel>Room ID</FormLabel>
                          <FormControl>
                            <Input placeholder="Enter room code" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" size="lg">
                      Join Room
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </TabsContent>

            <TabsContent value="create">
              <CardHeader>
                <CardTitle>Create a Room</CardTitle>
                <CardDescription>Start a new tutoring session as the host.</CardDescription>
              </CardHeader>
              <CardContent>
                <Form {...createForm}>
                  <form onSubmit={createForm.handleSubmit(onCreateSubmit)} className="space-y-4">
                    <FormField
                      control={createForm.control}
                      name="userName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Your Name</FormLabel>
                          <FormControl>
                            <Input placeholder="E.g., Dr. Smith" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type="submit" className="w-full" size="lg" disabled={createRoom.isPending}>
                      {createRoom.isPending ? "Creating..." : "Create Room"}
                      {!createRoom.isPending && <Users className="ml-2 h-4 w-4" />}
                    </Button>
                  </form>
                </Form>
              </CardContent>
            </TabsContent>
          </Tabs>
        </Card>
      </div>
    </div>
  );
}
