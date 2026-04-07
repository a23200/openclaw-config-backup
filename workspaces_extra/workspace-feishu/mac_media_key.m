#import <Cocoa/Cocoa.h>

void send_media_key(int key) {
    NSEvent *eventDown = [NSEvent otherEventWithType:NSEventTypeSystemDefined
                                            location:NSZeroPoint
                                       modifierFlags:0xa00
                                           timestamp:0
                                        windowNumber:0
                                             context:nil
                                             subtype:8
                                               data1:(key << 16) | (0xa << 8)
                                               data2:-1];
    CGEventPost(kCGHIDEventTap, [eventDown CGEvent]);

    NSEvent *eventUp = [NSEvent otherEventWithType:NSEventTypeSystemDefined
                                          location:NSZeroPoint
                                     modifierFlags:0xb00
                                         timestamp:0
                                      windowNumber:0
                                           context:nil
                                           subtype:8
                                             data1:(key << 16) | (0xb << 8)
                                             data2:-1];
    CGEventPost(kCGHIDEventTap, [eventUp CGEvent]);
}

int main(int argc, const char * argv[]) {
    @autoreleasepool {
        if (argc > 1) {
            int key = atoi(argv[1]);
            send_media_key(key);
        }
    }
    return 0;
}
