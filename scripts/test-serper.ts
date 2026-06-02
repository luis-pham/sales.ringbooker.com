import "dotenv/config";

async function testSerper() {
  if (!process.env.SERPER_API_KEY) {
    throw new Error("SERPER_API_KEY missing");
  }

  const res1 = await fetch("https://google.serper.dev/maps", {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: "hair salons Houston TX",
      gl: "us",
      hl: "en",
      num: 20,
    }),
  });
  const data1 = await res1.json();
  console.log("=== Test 1: Basic search ===");
  console.log("Total places:", data1.places?.length);
  console.log("First place fields:", Object.keys(data1.places?.[0] ?? {}));
  console.log("Has placeId:", Boolean(data1.places?.[0]?.placeId));
  console.log("Has cid:", Boolean(data1.places?.[0]?.cid));
  console.log("Has phone:", Boolean(data1.places?.[0]?.phoneNumber));
  console.log("Has coordinates:", Boolean(data1.places?.[0]?.latitude));

  const res2 = await fetch("https://google.serper.dev/maps", {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: "hair salons",
      gl: "us",
      hl: "en",
      num: 20,
      ll: "@29.7604,-95.3698,13z",
    }),
  });
  const data2 = await res2.json();
  console.log("\n=== Test 2: With coordinates ===");
  console.log("Total places:", data2.places?.length);
  console.log("Different from test 1?", data2.places?.[0]?.placeId !== data1.places?.[0]?.placeId);

  const res3 = await fetch("https://google.serper.dev/maps", {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.SERPER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      q: "hair salons Houston TX",
      gl: "us",
      hl: "en",
      num: 20,
      page: 2,
    }),
  });
  const data3 = await res3.json();
  console.log("\n=== Test 3: Page 2 ===");
  console.log("Total places:", data3.places?.length);
  console.log("Has results:", (data3.places?.length ?? 0) > 0);

  console.log("\n=== All fields in place result ===");
  console.log(JSON.stringify(data1.places?.[0], null, 2));
}

testSerper().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
