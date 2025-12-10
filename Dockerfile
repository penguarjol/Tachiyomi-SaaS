# Build stage
FROM gradle:8.5-jdk21 AS build

# Set test environment variables
ENV TEST_ENV=true
ENV JAVA_TOOL_OPTIONS="-Djava.awt.headless=true"
ENV TS_CONFIG_server_systemTrayEnabled=false

WORKDIR /home/gradle/src

# Copy gradle files if they exist
COPY *.gradle.kts .
COPY *.gradle .
COPY gradle gradle
COPY gradle.properties* .

# Download dependencies (this will do nothing if no gradle files are present)
RUN if [ -f build.gradle.kts ] || [ -f build.gradle ]; then gradle dependencies --no-daemon; fi

# Copy the rest of the source code
COPY . .

# Build the application with tests in headless environment
RUN gradle build --no-daemon

# Runtime stage
FROM eclipse-temurin:21-jre-jammy

WORKDIR /app

# Install necessary tools
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Copy the built artifact from the build stage
COPY --from=build /home/gradle/src/build/libs/*.jar ./suwayomi-server.jar

# Expose the port the app runs on
EXPOSE 4567

# Create a non-root user to run the application
RUN useradd -m suwayomi
USER suwayomi

# Set environment variables
ENV JAVA_OPTS="-Xmx2048m"

# Run the jar file
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar /app/suwayomi-server.jar"]