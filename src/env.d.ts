/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    admin?: {
      id: string;
      username: string;
    };
  }
}
