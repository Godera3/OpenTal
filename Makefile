# Makefile for OpenTal - Pure Mikhail Tal Edition
# Compile with: make
# Clean with: make clean

CXX = g++
CXXFLAGS = -std=c++14 -O3 -march=native -DUSE_THREADS
# Enable POPCNT if available:
# CXXFLAGS += -DUSE_MM_POPCNT

# Source files
SRCDIR = sources/src
SOURCES = $(wildcard $(SRCDIR)/*.cpp)
OBJECTS = $(SOURCES:.cpp=.o)
TARGET = opental

# Default target
all: $(TARGET)

$(TARGET): $(OBJECTS)
	$(CXX) $(CXXFLAGS) -o $@ $^ -lpthread

%.o: %.cpp
	$(CXX) $(CXXFLAGS) -c $< -o $@

clean:
	rm -f $(SRCDIR)/*.o $(TARGET)

.PHONY: all clean
